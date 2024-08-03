import { basename, dirname } from "path";
import { dialog } from "@electron/remote";
import { useState } from "react";
import { filePathsToImports, observer, useStores } from "medior/store";
import { CircularProgress } from "@mui/material";
import { Button, Card, Divider, Modal, Text, View } from "medior/components";
import { StorageInput } from "./storage-input";
import { colors, dayjs, deleteFile, dirToFilePaths, getConfig, makePerfLog, trpc } from "medior/utils";

export const StorageInputs = observer(() => {
  const stores = useStores();

  const [isLoading, setIsLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalOutput, setModalOutput] = useState<string>("");
  const [filesInDbOnly, setFilesInDbOnly] = useState<{ id: string; path: string }[]>([]);
  const [filesInStorageOnly, setFilesInStorageOnly] = useState<string[]>([]);

  const _log = (msg: string) =>
    setModalOutput((prev) => `[${dayjs().format("hh:mm:ss.SSS")}] ${msg}\n${prev}`);

  const handleAddLocation = async () => {
    const location = await selectLocation();
    if (location) stores.home.settings.addFileStorageLocation(location);
  };

  const handleDeleteFilesInDbOnly = async () => {
    try {
      setIsLoading(true);
      _log(`Deleting ${filesInDbOnly.length} files in database only...`);
      const res = await trpc.deleteFiles.mutate({ fileIds: filesInDbOnly.map(({ id }) => id) });
      if (!res.success) throw new Error(res.error);
      _log(`Deleted ${filesInDbOnly.length} files.`);
      setFilesInDbOnly([]);
    } catch (error) {
      console.error(error);
      _log(`ERROR: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteFilesInStorageOnly = async () => {
    try {
      setIsLoading(true);
      _log(`Deleting ${filesInStorageOnly.length} files in storage only...`);
      await Promise.all(filesInStorageOnly.map((path) => deleteFile(path)));
      _log(`Deleted ${filesInStorageOnly.length} files.`);
      setFilesInStorageOnly([]);
    } catch (error) {
      console.error(error);
      _log(`ERROR: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReImportFilesInStorageOnly = async () => {
    try {
      setIsLoading(true);
      _log(`Re-importing ${filesInStorageOnly.length} files in storage only...`);
      const res = await stores.import.createImportBatches([
        {
          deleteOnImport: false,
          ignorePrevDeleted: false,
          imports: await filePathsToImports(filesInStorageOnly),
          rootFolderPath: stores.import.editorRootFolder,
        },
      ]);
      if (!res.success) throw new Error(res.error);
      _log("Created import batch. Check Import Manager for progress.");
      setFilesInStorageOnly([]);
    } catch (error) {
      console.error(error);
      _log(`ERROR: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleScan = async () => {
    try {
      setModalOutput("");
      setIsLoading(true);
      setIsModalOpen(true);

      const logGap = "\n     ";
      const { perfLog, perfLogTotal } = makePerfLog("[SCAN]");

      const _logPerf = (msg: string) => {
        perfLog(msg);
        _log(msg);
      };

      const fileStorageLocations = getConfig().db.fileStorage.locations;
      _logPerf(`Scanning ${fileStorageLocations.length} file storage locations...`);

      const fileStorages = await Promise.all(
        fileStorageLocations.map(async (location) => ({
          location,
          filePaths: new Set(
            (await dirToFilePaths(location)).filter((path) => !/-thumb(-\d+)?\.\w+$/.test(path))
          ),
        }))
      );

      const pathsInFileStorage = new Set(fileStorages.flatMap(({ filePaths }) => [...filePaths]));
      _logPerf(`Found ${pathsInFileStorage.size} files in storage. Scanning database...`);

      const filePathsRes = await trpc.listFilePaths.mutate();
      if (!filePathsRes.success) throw new Error(filePathsRes.error);
      const dbFiles = filePathsRes.data;

      const pathsInDb = new Set(dbFiles.map(({ path }) => path));
      _logPerf(`Found ${pathsInDb.size} files in database.`);

      const filesInDbOnly = new Set<string>();
      const filesInStorageOnly = new Set<string>();

      for (const pathInDb of pathsInDb) {
        if (!pathsInFileStorage.has(pathInDb)) filesInDbOnly.add(pathInDb);
      }

      for (const pathInStorage of pathsInFileStorage) {
        if (!pathsInDb.has(pathInStorage)) pathsInFileStorage.add(pathInStorage);
      }
      _logPerf(
        `Found ${filesInDbOnly.size} files in database only. Found ${filesInStorageOnly.size} files in storage only.`
      );

      _log(`Files in storage only:${logGap}${[...filesInStorageOnly].join(logGap)}`);
      _log(`Files in db only:${logGap}${[...filesInDbOnly].join(logGap)}`);

      const fileInStorageToBasenameMap = new Map<string, string>();
      for (const pathInStorage of pathsInFileStorage) {
        fileInStorageToBasenameMap.set(basename(pathInStorage), pathInStorage);
      }

      const originalFilesInDbOnlySize = filesInDbOnly.size;
      const filesToRelinkMap = new Map<string, string>();

      for (const dbFilePath of filesInDbOnly) {
        const dbFileBasename = basename(dbFilePath);
        const pathInStorage = fileInStorageToBasenameMap.get(dbFileBasename);
        if (pathInStorage) filesToRelinkMap.set(dbFilePath, pathInStorage);
      }

      const filesToRelink = [...filesToRelinkMap.entries()];
      perfLog(`Found ${filesToRelink.length} files to relink.`);
      _log(
        `Found ${filesToRelink.length} files to relink:${filesToRelink.map(
          ([a, b]) => `${logGap}${a}${logGap}└─> ${b}`
        )}`
      );

      const files = filesToRelink.map(([dbFilePath, pathInStorage]) => {
        const dbFile = dbFiles.find((file) => file.path === dbFilePath);

        const thumbPaths =
          dbFile!.thumbPaths?.map((thumbPath) =>
            thumbPath.replace(dirname(thumbPath), dirname(pathInStorage))
          ) ?? [];

        filesInDbOnly.delete(dbFilePath);

        return {
          id: dbFile.id,
          path: pathInStorage,
          thumbPaths,
        };
      });

      const relinkRes = await trpc.relinkFiles.mutate({ files });
      if (!relinkRes.success) throw new Error(relinkRes.error);

      _logPerf(
        `Relinked ${originalFilesInDbOnlySize - filesInDbOnly.size} files. ${
          filesInDbOnly.size
        } files remaining.`
      );

      setFilesInDbOnly(
        [...filesInDbOnly].map((path) => ({
          id: dbFiles.find((file) => file.path === path)!.id,
          path,
        }))
      );
      setFilesInStorageOnly([...filesInStorageOnly]);

      _logPerf("Scan complete.");
      perfLogTotal("Scan complete.");
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const selectLocation = async () => {
    const res = await dialog.showOpenDialog({ properties: ["openDirectory"] });
    if (res.canceled) return;
    return res.filePaths[0];
  };

  return (
    <View column>
      <View row justify="center">
        <Text preset="label-glow">{"File Storage Locations"}</Text>
      </View>

      <View column spacing="0.5rem">
        {stores.home.settings.db.fileStorage.locations.map((_, index) => (
          <StorageInput
            {...{ index, selectLocation }}
            key={index}
            configKey="db.fileStorage.locations"
          />
        ))}

        <View row justify="center" spacing="0.5rem">
          {isModalOpen && (
            <Modal.Container height="90%" width="90%">
              <Modal.Header>
                <Text>{"File Storage / Database Sync"}</Text>
              </Modal.Header>

              <Modal.Content>
                <Card column height="100%" spacing="1rem">
                  <View row spacing="0.5rem">
                    {isLoading && <CircularProgress size="1em" />}

                    {filesInDbOnly.length > 0 && (
                      <Button
                        text="Delete Files in Database Only"
                        icon="Delete"
                        color={colors.button.red}
                        onClick={handleDeleteFilesInDbOnly}
                        disabled={isLoading}
                      />
                    )}

                    {filesInStorageOnly.length > 0 && (
                      <>
                        <Button
                          text="Delete Files in File Storages Only"
                          icon="Delete"
                          color={colors.button.red}
                          onClick={handleDeleteFilesInStorageOnly}
                          disabled={isLoading}
                        />

                        <Button
                          text="Re-Import Files in File Storages Only"
                          icon="Refresh"
                          onClick={handleReImportFilesInStorageOnly}
                          disabled={isLoading}
                        />
                      </>
                    )}
                  </View>

                  <Divider />

                  <Text overflow="auto" whiteSpace="pre">
                    {modalOutput}
                  </Text>
                </Card>
              </Modal.Content>

              <Modal.Footer>
                <Button
                  text="Close"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isLoading}
                  color={colors.button.darkGrey}
                />
              </Modal.Footer>
            </Modal.Container>
          )}

          <Button
            text="Add Location"
            icon="Add"
            onClick={handleAddLocation}
            color={colors.button.darkGrey}
            width="100%"
          />

          <Button
            text="Scan"
            icon="Refresh"
            onClick={handleScan}
            color={colors.button.darkGrey}
            width="100%"
          />
        </View>
      </View>
    </View>
  );
});
