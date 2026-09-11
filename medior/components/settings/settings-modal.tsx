import { dialog } from "@electron/remote";
import { ipcRenderer } from "electron";
import { useEffect, useState } from "react";
import { SORT_OPTIONS } from "medior/store/_generated";
import {
  Button,
  Card,
  Comp,
  ConfirmModal,
  Divider,
  Modal,
  Text,
  UniformList,
  View,
} from "medior/components";
import { useStores } from "medior/store";
import { colors, toast } from "medior/utils/client";
import { CONSTANTS } from "medior/utils/common";
import {
  loadConfig,
  TRANSCRIPTION_MODELS,
  TRANSCRIPTION_QUANTIZATION_OPTIONS,
  TranscriptionModel,
} from "medior/utils/server";
import { RepairModal, Settings } from ".";

export const SettingsModal = Comp(() => {
  const stores = useStores();
  const store = stores.home.settings;

  const [isConfirmDiscardOpen, setIsConfirmDiscardOpen] = useState(false);

  useEffect(() => {
    handleLoadConfig();
  }, []);

  const handleCancel = () => {
    if (store.hasUnsavedChanges) setIsConfirmDiscardOpen(true);
    else handleClose();
  };

  const handleClose = async () => {
    store.setIsOpen(false);
    store.setHasUnsavedChanges(false);
    return true;
  };

  const handleLoadConfig = async () => {
    store.setIsLoading(true);
    const config = await loadConfig(await ipcRenderer.invoke("getConfigPath"));
    stores.applyConfig(config);
    store.setIsLoading(false);
  };

  const handleFileCardFitContain = () => store.setFileCardFit("contain");

  const handleFileCardFitCover = () => store.setFileCardFit("cover");

  const handleFolderToCollection = (checked: boolean) =>
    store.setFolderToCollMode(checked ? "withoutTag" : "none");

  const handleFoldersToTags = (checked: boolean) =>
    store.setFolderToTagsMode(checked ? "hierarchical" : "none");

  const handleMongoDbPathClick = async (event: React.MouseEvent) => {
    event.preventDefault();
    const res = await dialog.showOpenDialog({ properties: ["openDirectory"] });
    if (res.canceled) return;
    store.setDbPath(res.filePaths[0]);
  };

  const handleSimilarityModelCachePathClick = async (event: React.MouseEvent) => {
    event.preventDefault();
    const res = await dialog.showOpenDialog({ properties: ["openDirectory"] });
    if (res.canceled) return;
    store.setSimilarityModelCachePath(res.filePaths[0]);
  };

  const handleVectorDbPathClick = async (event: React.MouseEvent) => {
    event.preventDefault();
    const res = await dialog.showOpenDialog({ properties: ["openDirectory"] });
    if (res.canceled) return;
    store.setVectorDbPath(res.filePaths[0]);
  };

  const handleRepair = () => store.setIsRepairOpen(true);

  const handleTranscriptionModelChange = (model?: string) => {
    if (!model) return;

    const transcription = store.file.transcription;
    const selectedModel = TRANSCRIPTION_MODELS.find(({ value }) => value === model);

    store.update({
      file: {
        transcription: {
          ...transcription,
          model: model as TranscriptionModel,
          quantization: selectedModel?.quantizations.includes(transcription.quantization)
            ? transcription.quantization
            : selectedModel?.quantizations.includes("int8")
              ? "int8"
              : selectedModel.quantizations[0],
        },
      },
    });
  };

  const handleSaveConfig = async () => {
    try {
      store.setIsLoading(true);

      stores.import.manager.pauseImporter();
      stores.faceRecog.clearQueue();
      stores.file.cancelFileRefresh();
      stores.tag.manager.clearRefreshQueue();

      await store.save();

      store.setIsLoading(false);
      store.setHasUnsavedChanges(false);
      toast.success("Settings saved!");
    } catch (err) {
      store.setIsLoading(false);
      toast.error("Failed to save settings.");
    }
  };

  const toggleFolderToCollWithTag = () => store.toggleFolderToCollMode();

  const toggleFoldersToTagsCascading = () => store.setFolderToTagsMode("cascading");

  const toggleFoldersToTagsHierarchical = () => store.setFolderToTagsMode("hierarchical");

  return (
    <Modal.Container
      isLoading={store.isLoading}
      onClose={handleCancel}
      height="100%"
      width="100%"
      maxWidth="55rem"
    >
      <Modal.Header>
        <Text preset="title">{"Settings"}</Text>
      </Modal.Header>

      <Modal.Content spacing="1.3rem" padding={{ bottom: "3rem" }}>
        <Settings.Section title="Database / Servers">
          <View row align="center" spacing="0.5rem">
            <Settings.Input
              header="Database Path"
              configKey="db.path"
              onClick={handleMongoDbPathClick}
              flex={1}
            />

            <Settings.NumInput header="Database Port" configKey="ports.db" />

            <Settings.NumInput header="Server Port" configKey="ports.server" />

            <Settings.NumInput header="Socket Port" configKey="ports.socket" />

            <Button
              text="Repair Database"
              icon="Build"
              onClick={handleRepair}
              color={colors.custom.black}
              padding={{ all: "0.5rem 0.8rem" }}
            />

            {stores.home.settings.isRepairOpen && <RepairModal />}
          </View>

          <Settings.StorageInputs />
        </Settings.Section>

        <Settings.Section title="Vectors">
          <View row spacing="0.5rem" overflow="auto">
            <Settings.Input
              header="Vector DB Path"
              configKey="db.vector.path"
              onClick={handleVectorDbPathClick}
              flex={1}
            />

            <Settings.Input
              header="Model Cache Path"
              configKey="file.similarity.modelCachePath"
              onClick={handleSimilarityModelCachePathClick}
              flex={1}
            />
          </View>

          <View row spacing="0.5rem" overflow="auto">
            <Settings.NumInput header="Vector Port" configKey="ports.vector" />

            <Settings.NumInput
              header="Inference Batch"
              configKey="file.similarity.visual.inferenceBatchSize"
              minValue={1}
              width="10rem"
            />
          </View>
        </Settings.Section>

        <Settings.Section title="Collections">
          <View row spacing="0.5rem" overflow="auto">
            <Settings.NumInput
              header="Editor - File Page Size"
              configKey="collection.editor.fileSearch.pageSize"
              minValue={1}
              maxValue={200}
              width="10rem"
            />

            <Settings.SortMenu
              header="Editor - Default Sort"
              configKey="collection.editor.search.sort"
              rows={SORT_OPTIONS.FileCollectionFile}
            />

            <Settings.NumInput
              header="Manager - Page Size"
              configKey="collection.manager.search.pageSize"
              minValue={25}
              maxValue={250}
              width="9rem"
            />

            <Settings.SortMenu
              header="Manager - Default Sort"
              configKey="collection.manager.search.sort"
              rows={SORT_OPTIONS.FileCollection}
            />
          </View>
        </Settings.Section>

        <Settings.Section title="Files">
          <View row spacing="0.5rem" overflow="auto">
            <Settings.NumInput
              header="Page Size"
              configKey="file.search.pageSize"
              minValue={25}
              maxValue={250}
              width="10rem"
            />

            <Settings.SortMenu
              header="Default Sort"
              configKey="file.search.sort"
              rows={SORT_OPTIONS.File}
            />

            <Card
              header="File Thumbnail Fit"
              row
              bgColor={colors.foregroundCard}
              padding={{ all: "0.1rem" }}
            >
              <Settings.Checkbox
                label="Contain"
                configKey="file.fileCardFit"
                checked={store.file.fileCardFit === "contain"}
                setChecked={handleFileCardFitContain}
              />

              <Settings.Checkbox
                label="Cover"
                configKey="file.fileCardFit"
                checked={store.file.fileCardFit === "cover"}
                setChecked={handleFileCardFitCover}
              />
            </Card>

            <Card
              header="File Name"
              row
              bgColor={colors.foregroundCard}
              padding={{ all: "0.1rem" }}
            >
              <Settings.Checkbox label="Show" configKey="file.showFileName" />
            </Card>

            <Card
              header="Rating Icon"
              row
              bgColor={colors.foregroundCard}
              padding={{ all: "0.1rem" }}
            >
              <Settings.Checkbox label="Hide Unrated" configKey="file.hideUnratedIcon" />
            </Card>
          </View>

          <Card
            header="Audio Metadata"
            row
            align="center"
            bgColor={colors.foregroundCard}
            padding={{ all: "0.1rem" }}
            spacing="0.5rem"
            width="fit-content"
          >
            <Settings.Checkbox label="Waveforms" configKey="file.waveform.enabled" />

            <Settings.Checkbox label="Transcriptions" configKey="file.transcription.enabled" />

            <Divider orientation="vertical" />

            <Settings.Dropdown
              configKey="file.transcription.model"
              header="Model"
              options={TRANSCRIPTION_MODELS}
              setValue={handleTranscriptionModelChange}
              value={store.file.transcription.model}
              width="15rem"
            />

            <Settings.Dropdown
              configKey="file.transcription.quantization"
              header="Quantization"
              options={TRANSCRIPTION_QUANTIZATION_OPTIONS.filter(({ value }) =>
                TRANSCRIPTION_MODELS.find(
                  ({ value }) => value === store.file.transcription.model,
                )?.quantizations.includes(value),
              )}
              value={store.file.transcription.quantization}
              width="8rem"
            />
          </Card>

          <UniformList row spacing="0.5rem" height="15rem">
            <Settings.ExtColumn
              label="Audio Codecs"
              options={CONSTANTS.AUDIO.CODECS}
              configKey="file.audioCodecs"
            />

            <Settings.ExtColumn
              label="Image Exts"
              options={CONSTANTS.IMAGE.EXTS}
              configKey="file.imageExts"
            />

            <Settings.ExtColumn
              label="Video Codecs"
              options={CONSTANTS.VIDEO.CODECS}
              configKey="file.videoCodecs"
            />

            <Settings.ExtColumn
              label="Video Exts"
              options={CONSTANTS.VIDEO.EXTS}
              configKey="file.videoExts"
            />
          </UniformList>
        </Settings.Section>

        <Settings.Section title="Imports">
          <View row spacing="0.5rem" overflow="auto">
            <View column spacing="0.3rem">
              <Settings.Checkbox label="Delete On Import" configKey="imports.deleteOnImport" />

              <Settings.Checkbox
                label="Ignore Prev. Deleted"
                configKey="imports.ignorePrevDeleted"
              />

              <Settings.Checkbox label="New Tags to RegEx" configKey="imports.withNewTagsToRegEx" />

              <Settings.Checkbox
                label="File to Tags (RegEx)"
                configKey="imports.withFileNameToTags"
              />

              <Settings.Input
                header="Folder Tags Delimiter"
                configKey="imports.folderDelimiter"
                width="10rem"
                textAlign="center"
              />
            </View>

            <View column spacing="0.3rem">
              <Settings.Checkbox
                label="Folder to Tags"
                configKey="imports.folderToTagsMode"
                checked={store.imports.folderToTagsMode !== "none"}
                setChecked={handleFoldersToTags}
              />

              <View column margins={{ left: "1rem" }} spacing="0.3rem">
                <Settings.Checkbox
                  label="Hierarchical"
                  configKey="imports.folderToTagsMode"
                  checked={store.imports.folderToTagsMode.includes("hierarchical")}
                  setChecked={toggleFoldersToTagsHierarchical}
                />

                <Settings.Checkbox
                  label="Cascading"
                  configKey="imports.folderToTagsMode"
                  checked={store.imports.folderToTagsMode === "cascading"}
                  setChecked={toggleFoldersToTagsCascading}
                />

                <Settings.Checkbox label="Delimited" configKey="imports.withDelimiters" />

                <Settings.Checkbox label="With RegEx" configKey="imports.withFolderNameRegEx" />
              </View>
            </View>

            <View column spacing="0.3rem">
              <Settings.Checkbox
                label="Folder to Collection"
                configKey="imports.folderToCollMode"
                checked={store.imports.folderToCollMode !== "none"}
                setChecked={handleFolderToCollection}
              />

              <View column margins={{ left: "1rem" }} spacing="0.3rem">
                <Settings.Checkbox
                  label="With Tags"
                  configKey="imports.folderToCollMode"
                  checked={store.imports.folderToCollMode === "withTag"}
                  setChecked={toggleFolderToCollWithTag}
                />
              </View>

              <Settings.Checkbox label="Diffusion Params" configKey="imports.withDiffParams" />

              <View column margins={{ left: "1rem" }} spacing="0.3rem">
                <Settings.Checkbox label="With Tags" configKey="imports.withDiffTags" />

                <View column margins={{ left: "1rem" }} spacing="0.3rem">
                  <Settings.Checkbox label="Model" configKey="imports.withDiffModel" />

                  <Settings.Checkbox label="With RegEx" configKey="imports.withDiffRegEx" />
                </View>
              </View>
            </View>

            <View column flex="1 0 auto" spacing="0.3rem">
              <Settings.Input header="Diffusion Tag Label" configKey="imports.labelDiff" />

              <Settings.Input
                header="Diffusion Model Tag Label"
                configKey="imports.labelDiffModel"
              />

              <Settings.Input
                header="Diffusion (Original) Tag Label"
                configKey="imports.labelDiffOriginal"
              />

              <Settings.Input
                header="Diffusion (Upscaled) Tag Label"
                configKey="imports.labelDiffUpscaled"
              />
            </View>
          </View>
        </Settings.Section>

        <Settings.Section title="Tags">
          <View row spacing="0.5rem">
            <Settings.NumInput
              header="Manager - Page Size"
              configKey="tags.manager.search.pageSize"
              minValue={1}
              maxValue={200}
              width="10rem"
            />

            <Settings.SortMenu
              header="Manager - Default Sort"
              configKey="tags.manager.search.sort"
              rows={SORT_OPTIONS.Tag}
            />
          </View>
        </Settings.Section>
      </Modal.Content>

      <Modal.Footer>
        <Button text="Cancel" icon="Close" onClick={handleCancel} />

        <Button
          text="Save"
          icon="Save"
          onClick={handleSaveConfig}
          disabled={!store.hasUnsavedChanges}
          color={store.hasUnsavedChanges ? colors.custom.blue : undefined}
        />
      </Modal.Footer>

      {isConfirmDiscardOpen && (
        <ConfirmModal
          headerText="Discard Changes"
          subText="Are you sure you want to discard your changes?"
          confirmText="Discard"
          setVisible={setIsConfirmDiscardOpen}
          onConfirm={handleClose}
        />
      )}
    </Modal.Container>
  );
});
