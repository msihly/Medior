import { basename } from "path";
import { dialog } from "@electron/remote";
import { useState } from "react";
import { filePathsToImports, observer, useStores } from "medior/store";
import { CircularProgress } from "@mui/material";
import { Button, Card, Divider, Modal, Text, UniformList, View } from "medior/components";
import { StorageInput } from "./storage-input";
import {
  colors,
  dayjs,
  deleteFile,
  dirToFilePaths,
  getConfig,
  makePerfLog,
  trpc,
} from "medior/utils";

export const StorageInputs = observer(() => {
  const stores = useStores();

  const [fileIdsLeftInDbOnly, setFileIdsLeftInDbOnly] = useState<string[]>([]);
  const [filesLeftInStorageOnly, setFilesLeftInStorageOnly] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalOutput, setModalOutput] = useState<string>("");

  const _asyncTry = async (fn: () => Promise<void>) => {
    try {
      setIsLoading(true);
      await fn();
    } catch (error) {
      console.error(error);
      _log(`ERROR: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const _log = (msg: string) =>
    setModalOutput((prev) => `[${dayjs().format("hh:mm:ss.SSS")}] ${msg}\n${prev}`);

  const getDesyncedFiles = async (pathsInDb: Set<string>, pathsInStorage: Set<string>) => {
    const pathsInDbOnly = new Set<string>();
    const pathsInStorageOnly = new Set<string>();

    for (const pathInDb of pathsInDb) {
      if (!pathsInStorage.has(pathInDb)) pathsInDbOnly.add(pathInDb);
    }
    _log(`Found ${pathsInDbOnly.size} files in database only.`);

    for (const pathInStorage of pathsInStorage) {
      if (!pathsInDb.has(pathInStorage)) pathsInStorageOnly.add(pathInStorage);
    }
    _log(`Found ${pathsInStorageOnly.size} files in storage only.`);

    return { pathsInDbOnly, pathsInStorageOnly };
  };

  const getFilesInStorage = async () => {
    const locations = getConfig().db.fileStorage.locations;
    _log(`Scanning ${locations.length} file storage locations...`);

    const fileStorages = await Promise.all(
      locations.map(async (location) => ({
        location,
        filePaths: new Set(await dirToFilePaths(location, true, /-thumb(-\d+)?\.\w+$/)),
      }))
    );

    const pathsInStorage = new Set(fileStorages.flatMap(({ filePaths }) => [...filePaths]));
    _log(`Found ${pathsInStorage.size} files in storage.`);
    return { pathsInStorage };
  };

  const getFilesInDatabase = async () => {
    _log("Loading files in database...");
    const filePathsRes = await trpc.listFilePaths.mutate();
    if (!filePathsRes.success) throw new Error(filePathsRes.error);
    const pathToIdMap = new Map(filePathsRes.data.map((file) => [file.path, file.id]));
    const pathsInDb = new Set(pathToIdMap.keys());
    _log(`Loaded ${pathsInDb.size} files in database.`);
    return { pathsInDb, pathToIdMap };
  };

  const getFilesToRelink = async (pathsInDb: Set<string>, pathsInStorage: Set<string>) => {
    const storageBasenameMap = new Map<string, string>();
    for (const pathInStorage of pathsInStorage) {
      storageBasenameMap.set(basename(pathInStorage).toLowerCase(), pathInStorage);
    }

    const filesToRelinkMap = new Map<string, string>();
    for (const pathInDb of pathsInDb) {
      const pathInStorage = storageBasenameMap.get(basename(pathInDb).toLowerCase());
      if (pathInStorage && pathInDb !== pathInStorage)
        filesToRelinkMap.set(pathInDb, pathInStorage);
    }

    return { filesToRelinkMap };
  };

  const handleAddLocation = async () => {
    const location = await selectLocation();
    if (location) stores.home.settings.addFileStorageLocation(location);
  };

  const handleDeleteFilesInDbOnly = () =>
    _asyncTry(async () => {
      _log(`Deleting ${fileIdsLeftInDbOnly.length} files in database only...`);
      const res = await trpc.deleteFiles.mutate({ fileIds: fileIdsLeftInDbOnly });
      if (!res.success) throw new Error(res.error);
      _log(`Deleted ${fileIdsLeftInDbOnly.length} files.`);
      setFileIdsLeftInDbOnly([]);
    });

  const handleDeleteFilesInStorageOnly = () =>
    _asyncTry(async () => {
      _log(`Deleting ${filesLeftInStorageOnly.length} files in storage only...`);
      await Promise.all(filesLeftInStorageOnly.map((path) => deleteFile(path)));
      _log(`Deleted ${filesLeftInStorageOnly.length} files.`);
      setFilesLeftInStorageOnly([]);
    });

  const handleReImportFilesInStorageOnly = () =>
    _asyncTry(async () => {
      _log(`Re-importing ${filesLeftInStorageOnly.length} files in storage only...`);
      const res = await stores.import.createImportBatches([
        {
          deleteOnImport: false,
          ignorePrevDeleted: false,
          imports: await filePathsToImports(filesLeftInStorageOnly),
          rootFolderPath: stores.import.editorRootFolder,
        },
      ]);
      if (!res.success) throw new Error(res.error);
      _log("Created import batch. Check Import Manager for progress.");
      setFilesLeftInStorageOnly([]);
    });

  const handleScan = () =>
    _asyncTry(async () => {
      setModalOutput("");
      setIsModalOpen(true);

      const { perfLog, perfLogTotal } = makePerfLog("[SCAN]");

      const { pathsInStorage } = await getFilesInStorage();
      perfLog(`Found ${pathsInStorage.size} files in storage.`);

      const { pathsInDb, pathToIdMap } = await getFilesInDatabase();
      perfLog(`Loaded ${pathsInDb.size} files from database.`);

      const { pathsInDbOnly, pathsInStorageOnly } = await getDesyncedFiles(
        pathsInDb,
        pathsInStorage
      );
      perfLog(
        `Found ${pathsInDbOnly.size} files in database only and ${pathsInStorageOnly.size} files in storage only.`
      );

      const { filesToRelinkMap } = await getFilesToRelink(pathsInDb, pathsInStorage);
      perfLog(`Found ${filesToRelinkMap.size} files to relink.`);

      await relinkFiles(pathToIdMap, filesToRelinkMap);
      perfLog("Relinked files.");

      const fileIdsInDbOnly = [...pathsInDbOnly]
        .map((path) => pathToIdMap.get(path))
        .filter(Boolean);
      setFileIdsLeftInDbOnly(fileIdsInDbOnly);
      _log(`${fileIdsInDbOnly.length} files remaining in database only.`);

      const filesInStorageOnly = [...pathsInStorageOnly];
      setFilesLeftInStorageOnly(filesInStorageOnly);
      _log(`${filesInStorageOnly.length} files remaining in storage only.`);

      _log("Scan complete.");
      perfLogTotal("Scan complete.");
    });

  const relinkFiles = async (
    pathToIdMap: Map<string, string>,
    filesToRelinkMap: Map<string, string>
  ) => {
    _log(`Relinking ${filesToRelinkMap.size} files and associated collections and imports...`);

    const filesToRelink = [...filesToRelinkMap.entries()].map(([oldPath, newPath]) => {
      const id = pathToIdMap.get(oldPath);
      pathToIdMap.delete(oldPath);
      return { id, path: newPath };
    });

    const res = await trpc.relinkFiles.mutate({ filesToRelink });
    if (!res.success) throw new Error(res.error);
    _log("Relinked files.");
  };

  const selectLocation = async () => {
    const res = await dialog.showOpenDialog({ properties: ["openDirectory"] });
    if (res.canceled) return;
    return res.filePaths[0];
  };

  return (
    <Card header="File Storage Locations" bgColor={colors.foregroundCard}>
      <View column spacing="0.5rem" padding={{ all: "0.5rem" }}>
        {stores.home.settings.db.fileStorage.locations.map((_, index) => (
          <StorageInput
            {...{ index, selectLocation }}
            key={index}
            configKey="db.fileStorage.locations"
          />
        ))}

        <UniformList row justify="center" spacing="0.5rem">
          <Button
            text="Add Location"
            icon="Add"
            onClick={handleAddLocation}
            colorOnHover={colors.custom.blue}
          />

          <Button
            text="Scan"
            icon="Refresh"
            onClick={handleScan}
            colorOnHover={colors.custom.purple}
          />
        </UniformList>

        {isModalOpen && (
          <Modal.Container height="90%" width="90%">
            <Modal.Header>
              <Text preset="title">{"File Storage / Database Sync"}</Text>
            </Modal.Header>

            <Modal.Content>
              <Card column height="100%" spacing="1rem">
                <View row spacing="0.5rem">
                  {isLoading && <CircularProgress size="1em" />}

                  {fileIdsLeftInDbOnly.length > 0 && (
                    <Button
                      text="Delete Files in Database Only"
                      icon="Delete"
                      color={colors.custom.red}
                      onClick={handleDeleteFilesInDbOnly}
                      disabled={isLoading}
                    />
                  )}

                  {filesLeftInStorageOnly.length > 0 && (
                    <>
                      <Button
                        text="Delete Files in Storages Only"
                        icon="Delete"
                        color={colors.custom.red}
                        onClick={handleDeleteFilesInStorageOnly}
                        disabled={isLoading}
                      />

                      <Button
                        text="Re-Import Files in Storages Only"
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
                color={colors.custom.darkGrey}
              />
            </Modal.Footer>
          </Modal.Container>
        )}
      </View>
    </Card>
  );
});
