import { dialog } from "@electron/remote";
import { basename } from "path";
import { useState } from "react";
import { CircularProgress } from "@mui/material";
import { Button, Card, Comp, Divider, Modal, Text, UniformList, View } from "medior/components";
import { filePathsToImports, useStores } from "medior/store";
import { colors, deleteFile, getConfig } from "medior/utils/client";
import { commas, dayjs } from "medior/utils/common";
import { dirToFilePaths, trpc } from "medior/utils/server";
import { StorageInput } from "./storage-input";

export const StorageInputs = Comp(() => {
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
    setModalOutput((prev) => `${prev}\n[${dayjs().format("hh:mm:ss.SSS")}] ${msg}`.trim());

  const getDesyncedFiles = async (pathsInDb: Set<string>, pathsInStorage: Set<string>) => {
    const pathsInDbOnly = new Set<string>();
    const pathsInStorageOnly = new Set<string>();

    for (const pathInDb of pathsInDb) {
      if (!pathsInStorage.has(pathInDb)) pathsInDbOnly.add(pathInDb);
    }
    _log(`Found ${commas(pathsInDbOnly.size)} files in database only.`);

    for (const pathInStorage of pathsInStorage) {
      if (!pathsInDb.has(pathInStorage)) pathsInStorageOnly.add(pathInStorage);
    }
    _log(`Found ${commas(pathsInStorageOnly.size)} files in storage only.`);

    return { pathsInDbOnly, pathsInStorageOnly };
  };

  const getFilesInStorage = async () => {
    const locations = getConfig().db.fileStorage.locations;

    const map = new Map<string, string[]>();
    for (const dirPath of locations) {
      _log(`Scanning file storage: ${dirPath}`);
      const files = await dirToFilePaths(dirPath, /-thumb(-\d+)?\.\w+$/);
      _log(`Found ${commas(files.length)} in storage.`);
      map.set(dirPath, files);
    }

    const filesInStorage = new Set([...map.values()].flat());
    _log(`Found ${commas(filesInStorage.size)} files in storage.`);
    return filesInStorage;
  };

  const getFilesInDatabase = async () => {
    _log("Loading files in database...");
    const filePathsRes = await trpc.listFilePaths.mutate();
    if (!filePathsRes.success) throw new Error(filePathsRes.error);
    const pathToIdMap = new Map(filePathsRes.data.map((file) => [file.path, file.id]));
    const pathsInDb = new Set(pathToIdMap.keys());
    _log(`Loaded ${commas(pathsInDb.size)} files in database.`);
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

    _log(`Found ${commas(filesToRelinkMap.size)} files to relink.`);
    return { filesToRelinkMap };
  };

  const handleAddLocation = async () => {
    const location = await selectLocation();
    if (location) stores.home.settings.addFileStorageLocation(location);
  };

  const handleDeleteFilesInDbOnly = () =>
    _asyncTry(async () => {
      _log(`Deleting ${commas(fileIdsLeftInDbOnly.length)} files in database only...`);
      const res = await trpc.deleteFiles.mutate({ fileIds: fileIdsLeftInDbOnly });
      if (!res.success) throw new Error(res.error);
      _log(`Deleted ${commas(fileIdsLeftInDbOnly.length)} files.`);
      setFileIdsLeftInDbOnly([]);
    });

  const handleDeleteFilesInStorageOnly = () =>
    _asyncTry(async () => {
      _log(`Deleting ${commas(filesLeftInStorageOnly.length)} files in storage only...`);
      for (const file of filesLeftInStorageOnly) {
        const res = await deleteFile(file);
        if (!res.success) _log(`[Warning] Failed to delete: ${file}`);
        if (res.data === false) _log(`[Warning] Skipping deletion, file does not exist: ${file}`);
      }
      _log(`Deleted ${commas(filesLeftInStorageOnly.length)} files.`);
      setFilesLeftInStorageOnly([]);
    });

  const handleReImportFilesInStorageOnly = () =>
    _asyncTry(async () => {
      _log(`Re-importing ${commas(filesLeftInStorageOnly.length)} files in storage only...`);
      const res = await stores.import.manager.createImportBatches([
        {
          deleteOnImport: false,
          ignorePrevDeleted: false,
          imports: await filePathsToImports(filesLeftInStorageOnly),
          remux: false,
          rootFolderPath: stores.import.editor.rootFolder,
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

      const pathsInStorage = await getFilesInStorage();

      const { pathsInDb, pathToIdMap } = await getFilesInDatabase();

      const { pathsInDbOnly, pathsInStorageOnly } = await getDesyncedFiles(
        pathsInDb,
        pathsInStorage,
      );

      const { filesToRelinkMap } = await getFilesToRelink(pathsInDb, pathsInStorage);

      await relinkFiles(pathToIdMap, filesToRelinkMap);

      const fileIdsInDbOnly = [...pathsInDbOnly]
        .map((path) => pathToIdMap.get(path))
        .filter(Boolean);

      setFileIdsLeftInDbOnly(fileIdsInDbOnly);
      _log(`${commas(fileIdsInDbOnly.length)} files remaining in database only.`);

      const filesInStorageOnly = [...pathsInStorageOnly];
      setFilesLeftInStorageOnly(filesInStorageOnly);
      _log(`${commas(filesInStorageOnly.length)} files remaining in storage only.`);

      _log("Scan complete.");
    });

  const relinkFiles = async (
    pathToIdMap: Map<string, string>,
    filesToRelinkMap: Map<string, string>,
  ) => {
    _log(
      `Relinking ${commas(filesToRelinkMap.size)} files and associated collections and imports...`,
    );

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
