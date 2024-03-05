import { dialog } from "@electron/remote";
import { SocketEmitEvent } from "server";
import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import {
  Button,
  ConfirmModal,
  FolderToCollMode,
  FolderToTagsMode,
  Modal,
  SortMenuProps,
  Text,
  View,
} from "components";
import {
  SettingsCheckbox,
  SettingsDivider,
  SettingsExtCheckbox,
  SettingsInput,
  SettingsLabel,
  SettingsNumInput,
  SettingsSection,
  SettingsSortMenu,
} from ".";
import {
  colors,
  CONSTANTS,
  DEFAULT_CONFIG,
  ImageType,
  loadConfig,
  makeClasses,
  saveConfig,
  socket,
  trpc,
  VideoType,
} from "utils";
import { toast } from "react-toastify";
import Color from "color";

export const SettingsModal = observer(() => {
  const { css } = useClasses(null);

  const { homeStore, faceRecognitionStore, fileStore, importStore, tagStore } = useStores();

  const [collEditorPageSize, setCollEditorPageSize] = useState<number>(
    DEFAULT_CONFIG.collection.editorPageSize
  );
  const [collEditorSearchSort, setCollEditorSearchSort] = useState<SortMenuProps["value"]>(
    DEFAULT_CONFIG.collection.editorSearchSort
  );
  const [collManagerSearchSort, setCollManagerSearchSort] = useState<SortMenuProps["value"]>(
    DEFAULT_CONFIG.collection.managerSearchSort
  );
  const [collSearchFileCount, setCollSearchFileCount] = useState<number>(
    DEFAULT_CONFIG.collection.searchFileCount
  );
  const [dbPort, setDbPort] = useState<number>(DEFAULT_CONFIG.ports.db);
  const [fileCardFit, setFileCardFit] = useState<"contain" | "cover">(
    DEFAULT_CONFIG.file.fileCardFit
  );
  const [fileSearchFileCount, setFileSearchFileCount] = useState<number>(
    DEFAULT_CONFIG.file.searchFileCount
  );
  const [fileSearchSort, setFileSearchSort] = useState<SortMenuProps["value"]>(
    DEFAULT_CONFIG.file.searchSort
  );
  const [hideUnratedIcon, setHideUnratedIcon] = useState<boolean>(
    DEFAULT_CONFIG.file.hideUnratedIcon
  );
  const [imageTypes, setImageTypes] = useState<ImageType[]>(DEFAULT_CONFIG.file.imageTypes);
  const [importsDeleteOnImport, setImportsDeleteOnImport] = useState<boolean>(
    DEFAULT_CONFIG.imports.deleteOnImport
  );
  const [importsFolderDelimeter, setImportsFolderDelimeter] = useState<string>(
    DEFAULT_CONFIG.imports.folderDelimiter
  );
  const [importsFolderToCollMode, setImportsFolderToCollMode] = useState<FolderToCollMode>(
    DEFAULT_CONFIG.imports.folderToCollMode
  );
  const [importsFolderToTagsMode, setImportsFolderToTagsMode] = useState<FolderToTagsMode>(
    DEFAULT_CONFIG.imports.folderToTagsMode
  );
  const [importsIgnorePrevDeleted, setImportsIgnorePrevDeleted] = useState<boolean>(
    DEFAULT_CONFIG.imports.ignorePrevDeleted
  );
  const [importsLabelDiff, setImportsLabelDiff] = useState<string>(
    DEFAULT_CONFIG.imports.labelDiff
  );
  const [importsLabelDiffModel, setImportsLabelDiffModel] = useState<string>(
    DEFAULT_CONFIG.imports.labelDiffModel
  );
  const [importsLabelDiffOriginal, setImportsLabelDiffOriginal] = useState<string>(
    DEFAULT_CONFIG.imports.labelDiffOriginal
  );
  const [importsLabelDiffUpscaled, setImportsLabelDiffUpscaled] = useState<string>(
    DEFAULT_CONFIG.imports.labelDiffUpscaled
  );
  const [importsWithDelimiters, setImportsWithDelimiters] = useState<boolean>(
    DEFAULT_CONFIG.imports.withDelimiters
  );
  const [importsWithDiffModel, setImportsWithDiffModel] = useState<boolean>(
    DEFAULT_CONFIG.imports.withDiffModel
  );
  const [importsWithDiffRegEx, setImportsWithDiffRegEx] = useState<boolean>(
    DEFAULT_CONFIG.imports.withDiffRegEx
  );
  const [importsWithDiffParams, setImportsWithDiffParams] = useState<boolean>(
    DEFAULT_CONFIG.imports.withDiffParams
  );
  const [importsWithDiffTags, setImportsWithDiffTags] = useState<boolean>(
    DEFAULT_CONFIG.imports.withDiffTags
  );
  const [importsWithFileNameToTags, setImportsWithFileNameToTags] = useState<boolean>(
    DEFAULT_CONFIG.imports.withFileNameToTags
  );
  const [importsWithFolderNameRegEx, setImportsWithFolderNameRegEx] = useState<boolean>(
    DEFAULT_CONFIG.imports.withFolderNameRegEx
  );
  const [importsWithNewTagsToRegEx, setImportsWithNewTagsToRegEx] = useState<boolean>(
    DEFAULT_CONFIG.imports.withNewTagsToRegEx
  );
  const [isConfirmDiscardOpen, setIsConfirmDiscardOpen] = useState<boolean>(false);
  const [mongoDbPath, setMongoDbPath] = useState<string>(DEFAULT_CONFIG.mongo.dbPath);
  const [mongoOutputDir, setMongoOutputDir] = useState<string>(DEFAULT_CONFIG.mongo.outputDir);
  const [serverPort, setServerPort] = useState<number>(DEFAULT_CONFIG.ports.server);
  const [socketPort, setSocketPort] = useState<number>(DEFAULT_CONFIG.ports.socket);
  const [tagManagerSort, setTagManagerSort] = useState<SortMenuProps["value"]>(
    DEFAULT_CONFIG.tags.managerSearchSort
  );
  const [videoTypes, setVideoTypes] = useState<VideoType[]>(DEFAULT_CONFIG.file.videoTypes);

  useEffect(() => {
    handleLoadConfig();
  }, []);

  const handleCancel = () => {
    if (homeStore.settingsHasUnsavedChanges) setIsConfirmDiscardOpen(true);
    else handleClose();
  };

  const handleClose = () => {
    homeStore.setIsSettingsOpen(false);
    homeStore.setSettingsHasUnsavedChanges(false);
  };

  const handleLoadConfig = async () => {
    homeStore.setIsSettingsLoading(true);

    const config = await loadConfig();
    setCollEditorPageSize(config.collection.editorPageSize);
    setCollEditorSearchSort(config.collection.editorSearchSort);
    setCollManagerSearchSort(config.collection.managerSearchSort);
    setCollSearchFileCount(config.collection.searchFileCount);
    setDbPort(config.ports.db);
    setFileCardFit(config.file.fileCardFit);
    setFileSearchFileCount(config.file.searchFileCount);
    setHideUnratedIcon(config.file.hideUnratedIcon);
    setImageTypes(config.file.imageTypes);
    setImportsDeleteOnImport(config.imports.deleteOnImport);
    setImportsFolderDelimeter(config.imports.folderDelimiter);
    setImportsFolderToCollMode(config.imports.folderToCollMode);
    setImportsFolderToTagsMode(config.imports.folderToTagsMode);
    setImportsIgnorePrevDeleted(config.imports.ignorePrevDeleted);
    setImportsLabelDiff(config.imports.labelDiff);
    setImportsLabelDiffModel(config.imports.labelDiffModel);
    setImportsLabelDiffOriginal(config.imports.labelDiffOriginal);
    setImportsLabelDiffUpscaled(config.imports.labelDiffUpscaled);
    setImportsWithDelimiters(config.imports.withDelimiters);
    setImportsWithDiffModel(config.imports.withDiffModel);
    setImportsWithDiffParams(config.imports.withDiffParams);
    setImportsWithDiffRegEx(config.imports.withDiffRegEx);
    setImportsWithDiffTags(config.imports.withDiffTags);
    setImportsWithFileNameToTags(config.imports.withFileNameToTags);
    setImportsWithFolderNameRegEx(config.imports.withFolderNameRegEx);
    setImportsWithNewTagsToRegEx(config.imports.withNewTagsToRegEx);
    setMongoDbPath(config.mongo.dbPath);
    setMongoDbPath(config.mongo.dbPath);
    setMongoOutputDir(config.mongo.outputDir);
    setMongoOutputDir(config.mongo.outputDir);
    setServerPort(config.ports.server);
    setServerPort(config.ports.server);
    setSocketPort(config.ports.socket);
    setSocketPort(config.ports.socket);
    setTagManagerSort(config.tags.managerSearchSort);
    setVideoTypes(config.file.videoTypes);

    homeStore.setIsSettingsLoading(false);
  };

  const handleFileCardFitContain = () => {
    setFileCardFit("contain");
    homeStore.setSettingsHasUnsavedChanges(true);
  };

  const handleFileCardFitCover = () => {
    setFileCardFit("cover");
    homeStore.setSettingsHasUnsavedChanges(true);
  };

  const handleFolderToCollection = (checked: boolean) => {
    setImportsFolderToCollMode(checked ? "withoutTag" : "none");
    homeStore.setSettingsHasUnsavedChanges(true);
  };

  const handleFoldersToTags = (checked: boolean) => {
    setImportsFolderToTagsMode(checked ? "hierarchical" : "none");
    homeStore.setSettingsHasUnsavedChanges(true);
  };

  const handleMongoDbPathClick = async (event: React.MouseEvent) => {
    event.preventDefault();
    const res = await dialog.showOpenDialog({ properties: ["openDirectory"] });
    if (res.canceled) return;
    setMongoDbPath(res.filePaths[0]);
    homeStore.setSettingsHasUnsavedChanges(true);
  };

  const handleMongoOutputDirClick = async (event: React.MouseEvent) => {
    event.preventDefault();
    const res = await dialog.showOpenDialog({ properties: ["openDirectory"] });
    if (res.canceled) return;
    setMongoOutputDir(res.filePaths[0]);
    homeStore.setSettingsHasUnsavedChanges(true);
  };

  const handleSaveConfig = async () => {
    try {
      homeStore.setIsSettingsLoading(true);

      const oldConfig = await loadConfig();
      const hasDbDiff = oldConfig.mongo.dbPath !== mongoDbPath || oldConfig.ports.db !== dbPort;
      const hasServerDiff = oldConfig.ports.server !== serverPort;
      const hasSocketDiff = oldConfig.ports.socket !== socketPort;

      await saveConfig({
        collection: {
          editorPageSize: collEditorPageSize,
          editorSearchSort: collEditorSearchSort,
          managerSearchSort: collManagerSearchSort,
          searchFileCount: collSearchFileCount,
        },
        file: {
          fileCardFit,
          imageTypes,
          hideUnratedIcon,
          searchFileCount: fileSearchFileCount,
          searchSort: fileSearchSort,
          videoTypes,
        },
        imports: {
          deleteOnImport: importsDeleteOnImport,
          folderDelimiter: importsFolderDelimeter,
          folderToCollMode: importsFolderToCollMode,
          folderToTagsMode: importsFolderToTagsMode,
          ignorePrevDeleted: importsIgnorePrevDeleted,
          labelDiff: importsLabelDiff,
          labelDiffModel: importsLabelDiffModel,
          labelDiffOriginal: importsLabelDiffOriginal,
          labelDiffUpscaled: importsLabelDiffUpscaled,
          withDelimiters: importsWithDelimiters,
          withDiffModel: importsWithDiffModel,
          withDiffParams: importsWithDiffParams,
          withDiffRegEx: importsWithDiffRegEx,
          withDiffTags: importsWithDiffTags,
          withFileNameToTags: importsWithFileNameToTags,
          withFolderNameRegEx: importsWithFolderNameRegEx,
          withNewTagsToRegEx: importsWithNewTagsToRegEx,
        },
        mongo: {
          dbPath: mongoDbPath,
          outputDir: mongoOutputDir,
        },
        ports: {
          db: dbPort,
          server: serverPort,
          socket: socketPort,
        },
        tags: {
          managerSearchSort: tagManagerSort,
        },
      });

      faceRecognitionStore.autoDetectQueue.clear();
      fileStore.infoRefreshQueue.clear();
      importStore.queue.clear();
      tagStore.countsRefreshQueue.clear();
      tagStore.relationsRefreshQueue.clear();

      if (hasDbDiff || hasServerDiff || hasSocketDiff)
        await trpc.reloadServers.mutate({
          withDatabase: hasDbDiff,
          withServer: hasServerDiff,
          withSocket: hasSocketDiff,
        });

      [
        "reloadFileCollections",
        "reloadFiles",
        "reloadImportBatches",
        "reloadRegExMaps",
        "reloadTags",
      ].forEach((event: SocketEmitEvent) => socket.emit(event));

      homeStore.setIsSettingsLoading(false);
      homeStore.setSettingsHasUnsavedChanges(false);
      toast.success("Settings saved!");
    } catch (err) {
      homeStore.setIsSettingsLoading(false);
      toast.error("Failed to save settings.");
    }
  };

  const toggleFolderToCollWithTag = () => {
    setImportsFolderToCollMode((prev) => (prev === "withTag" ? "withoutTag" : "withTag"));
    homeStore.setSettingsHasUnsavedChanges(true);
  };

  const toggleFoldersToTagsCascading = () => {
    setImportsFolderToTagsMode("cascading");
    homeStore.setSettingsHasUnsavedChanges(true);
  };

  const toggleFoldersToTagsHierarchical = () => {
    setImportsFolderToTagsMode("hierarchical");
    homeStore.setSettingsHasUnsavedChanges(true);
  };

  return (
    <Modal.Container onClose={handleCancel} height="100%" width="100%" maxWidth="55rem">
      <Modal.Header className={css.modalHeader}>
        <Text>{"Settings"}</Text>
      </Modal.Header>

      <Modal.Content className={css.modalContent}>
        <SettingsSection title="Database / Servers">
          <View className={css.settingsRow}>
            <SettingsInput
              label="Database Path"
              value={mongoDbPath}
              onClick={handleMongoDbPathClick}
              flex={1}
            />

            <SettingsInput
              label="File Output Directory"
              value={mongoOutputDir}
              onClick={handleMongoOutputDirClick}
              flex={1}
            />
          </View>

          <View className={css.settingsRow}>
            <SettingsNumInput
              label="Database Port"
              value={dbPort}
              setValue={setDbPort}
              width="6rem"
            />

            <SettingsNumInput
              label="Server Port"
              value={serverPort}
              setValue={setServerPort}
              width="6rem"
            />

            <SettingsNumInput
              label="Socket Port"
              value={socketPort}
              setValue={setSocketPort}
              width="6rem"
            />
          </View>
        </SettingsSection>

        <SettingsDivider />

        <SettingsSection title="Collections">
          <View className={css.settingsRow}>
            <SettingsNumInput
              label="Editor Page Size"
              value={collEditorPageSize}
              setValue={setCollEditorPageSize}
              minValue={1}
              maxValue={200}
            />

            <SettingsNumInput
              label="Search Results Count"
              value={collSearchFileCount}
              setValue={setCollSearchFileCount}
              minValue={25}
              maxValue={250}
            />

            <SettingsSortMenu
              label="Editor - Default Search Sort"
              rows={CONSTANTS.SORT_MENU_OPTS.FILE_SEARCH}
              value={collEditorSearchSort}
              setValue={setCollEditorSearchSort}
            />

            <SettingsSortMenu
              label="Manager - Default Search Sort"
              rows={CONSTANTS.SORT_MENU_OPTS.COLLECTION_SEARCH}
              value={collManagerSearchSort}
              setValue={setCollManagerSearchSort}
            />
          </View>
        </SettingsSection>

        <SettingsDivider />

        <SettingsSection title="Files">
          <View className={css.settingsRow}>
            <SettingsNumInput
              label="Search Results Count"
              value={fileSearchFileCount}
              setValue={setFileSearchFileCount}
              minValue={25}
              maxValue={250}
            />

            <SettingsSortMenu
              label="Default Search Sort"
              rows={CONSTANTS.SORT_MENU_OPTS.FILE_SEARCH}
              value={fileSearchSort}
              setValue={setFileSearchSort}
            />

            <View column>
              <SettingsLabel label="File Thumbnail Fit" />
              <View row>
                <SettingsCheckbox
                  label="Contain"
                  checked={fileCardFit === "contain"}
                  setChecked={handleFileCardFitContain}
                />

                <SettingsCheckbox
                  label="Cover"
                  checked={fileCardFit === "cover"}
                  setChecked={handleFileCardFitCover}
                />
              </View>
            </View>

            <View column>
              <SettingsLabel label="Rating Icon" />
              <SettingsCheckbox
                label="Hide Unrated"
                checked={hideUnratedIcon}
                setChecked={setHideUnratedIcon}
              />
            </View>
          </View>

          <View column>
            <SettingsLabel label="Handled / Displayed Image Types" />
            <View className={css.extContainer}>
              {CONSTANTS.IMAGE_TYPES.map((ext) => (
                <SettingsExtCheckbox
                  key={ext}
                  ext={ext}
                  extTypes={imageTypes}
                  setExtTypes={setImageTypes}
                />
              ))}
            </View>
          </View>

          <View column>
            <SettingsLabel label="Handled / Displayed Video Types" />
            <View className={css.extContainer}>
              {CONSTANTS.VIDEO_TYPES.map((ext) => (
                <SettingsExtCheckbox
                  key={ext}
                  ext={ext}
                  extTypes={videoTypes}
                  setExtTypes={setVideoTypes}
                />
              ))}
            </View>
          </View>
        </SettingsSection>

        <SettingsDivider />

        <SettingsSection title="Imports">
          <View className={css.settingsRow}>
            <View column>
              <SettingsCheckbox
                label="Delete On Import"
                checked={importsDeleteOnImport}
                setChecked={setImportsDeleteOnImport}
              />

              <SettingsCheckbox
                label="Ignore Prev. Deleted"
                checked={importsIgnorePrevDeleted}
                setChecked={setImportsIgnorePrevDeleted}
              />

              <SettingsCheckbox
                label="New Tags to RegEx"
                checked={importsWithNewTagsToRegEx}
                setChecked={setImportsWithNewTagsToRegEx}
              />

              <SettingsCheckbox
                label="File to Tags (RegEx)"
                checked={importsWithFileNameToTags}
                setChecked={setImportsWithFileNameToTags}
              />

              <SettingsInput
                label="Folder Tags Delimiter"
                value={importsFolderDelimeter}
                setValue={setImportsFolderDelimeter}
                width="8rem"
                textAlign="center"
              />
            </View>

            <View column>
              <SettingsCheckbox
                label="Folder to Tags"
                checked={importsFolderToTagsMode !== "none"}
                setChecked={handleFoldersToTags}
              />

              <View column margins={{ left: "1rem" }}>
                <SettingsCheckbox
                  label="Hierarchical"
                  checked={importsFolderToTagsMode?.includes("hierarchical")}
                  setChecked={toggleFoldersToTagsHierarchical}
                />

                <SettingsCheckbox
                  label="Cascading"
                  checked={importsFolderToTagsMode === "cascading"}
                  setChecked={toggleFoldersToTagsCascading}
                />

                <SettingsCheckbox
                  label="Delimited"
                  checked={importsWithDelimiters}
                  setChecked={setImportsWithDelimiters}
                />

                <SettingsCheckbox
                  label="With RegEx"
                  checked={importsWithFolderNameRegEx}
                  setChecked={setImportsWithFolderNameRegEx}
                />
              </View>
            </View>

            <View column>
              <SettingsCheckbox
                label="Folder to Collection"
                checked={importsFolderToCollMode !== "none"}
                setChecked={handleFolderToCollection}
              />

              <View column margins={{ left: "1rem" }}>
                <SettingsCheckbox
                  label="With Tags"
                  checked={importsFolderToCollMode === "withTag"}
                  setChecked={toggleFolderToCollWithTag}
                />
              </View>

              <SettingsCheckbox
                label="Diffusion Params"
                checked={importsWithDiffParams}
                setChecked={setImportsWithDiffParams}
              />

              <View column margins={{ left: "1rem" }}>
                <SettingsCheckbox
                  label="With Tags"
                  checked={importsWithDiffTags}
                  setChecked={setImportsWithDiffTags}
                />

                <View column margins={{ left: "1rem" }}>
                  <SettingsCheckbox
                    label="Model"
                    checked={importsWithDiffModel}
                    setChecked={setImportsWithDiffModel}
                  />

                  <SettingsCheckbox
                    label="With RegEx"
                    checked={importsWithDiffRegEx}
                    setChecked={setImportsWithDiffRegEx}
                  />
                </View>
              </View>
            </View>

            <View column spacing="0.4rem">
              <SettingsInput
                label="Diffusion Tag Label"
                value={importsLabelDiff}
                setValue={setImportsLabelDiff}
              />

              <SettingsInput
                label="Diffusion Model Tag Label"
                value={importsLabelDiffModel}
                setValue={setImportsLabelDiffModel}
              />

              <SettingsInput
                label="Diffusion (Original) Tag Label"
                value={importsLabelDiffOriginal}
                setValue={setImportsLabelDiffOriginal}
              />

              <SettingsInput
                label="Diffusion (Upscaled) Tag Label"
                value={importsLabelDiffUpscaled}
                setValue={setImportsLabelDiffUpscaled}
              />
            </View>
          </View>
        </SettingsSection>

        <SettingsDivider />

        <SettingsSection title="Tags">
          <SettingsSortMenu
            label="Default Tag Manager Sort"
            rows={CONSTANTS.SORT_MENU_OPTS.TAG_SEARCH}
            value={tagManagerSort}
            setValue={setTagManagerSort}
          />
        </SettingsSection>
      </Modal.Content>

      <Modal.Footer>
        {isConfirmDiscardOpen && (
          <ConfirmModal
            headerText="Discard Changes"
            subText="Are you sure you want to discard your changes?"
            confirmText="Discard"
            setVisible={setIsConfirmDiscardOpen}
            onConfirm={handleClose}
          />
        )}

        <Button
          text="Cancel"
          icon="Close"
          onClick={handleCancel}
          disabled={homeStore.isSettingsLoading}
          color={colors.button.grey}
        />

        <Button
          text="Save"
          icon="Save"
          onClick={handleSaveConfig}
          disabled={homeStore.isSettingsLoading}
        />
      </Modal.Footer>
    </Modal.Container>
  );
});

const useClasses = makeClasses({
  extContainer: {
    display: "flex",
    flexFlow: "row wrap",
    borderRadius: "0.5rem",
    padding: "0.3rem",
    backgroundColor: Color(colors.grey["800"]).darken(0.15).string(),
  },
  modalContent: {
    overflowX: "auto",
  },
  modalHeader: {
    margin: 0,
    padding: "0.5rem 0",
  },
  settingsRow: {
    display: "flex",
    flexFlow: "row wrap",
    "& > *:not(:last-child)": {
      margin: "0 0.5rem 0.5rem 0",
    },
  },
});
