import { dialog } from "@electron/remote";
import { ipcRenderer } from "electron";
import { useEffect, useState } from "react";
import { SORT_OPTIONS } from "medior/store/_generated";
import {
  Button,
  Card,
  CheckboxProps,
  Comp,
  ConfirmModal,
  IconName,
  LoadingOverlay,
  MediaProgramDropdown,
  Modal,
  Text,
  UniformList,
  View,
} from "medior/components";
import { useStores } from "medior/store";
import { colors, toast, useCancellableLoad } from "medior/utils/client";
import { CONSTANTS, SUBTITLE_MODES } from "medior/utils/common";
import {
  AUDIO_SIMILARITY_DEVICE_OPTIONS,
  AUDIO_SIMILARITY_LAYER_OPTIONS,
  AUDIO_SIMILARITY_MODELS,
  DEV_TOOLS_MODES,
  getConfig,
  loadConfig,
  SIMILARITY_DEVICE_OPTIONS,
  TRANSCRIPTION_MODELS,
  TRANSCRIPTION_QUANTIZATION_OPTIONS,
  TranscriptionModel,
} from "medior/utils/server";
import { Settings } from ".";

const FILE_CARD_FIT_OPTIONS = [
  { label: "Contain", value: "contain" },
  { label: "Cover", value: "cover" },
];

/** Matches the Ingester's import options. */
const INGESTER_CHECKBOX_PROPS: Partial<CheckboxProps> = {
  flex: "initial",
  padding: { all: "0.5rem" },
};

const REMUX_EXTS = CONSTANTS.VIDEO.EXTS.filter((ext) => ext !== "mp4");

const TABS = [
  { icon: "Storage", label: "Database / Servers" },
  { icon: "Hub", label: "Vectors" },
  { icon: "Collections", label: "Collections" },
  { icon: "InsertDriveFile", label: "Files" },
  { icon: "GetApp", label: "Imports" },
  { icon: "LiveTv", label: "Media Programs" },
  { icon: "Label", label: "Tags" },
  { icon: "Code", label: "Developer" },
] as const satisfies readonly { icon: IconName; label: string }[];

type SettingsTab = (typeof TABS)[number]["label"];

export const SettingsModal = Comp(() => {
  const stores = useStores();
  const store = stores.home.settings;

  const load = useCancellableLoad();

  const [activeTab, setActiveTab] = useState<SettingsTab>(TABS[0].label);
  const [isConfirmDiscardOpen, setIsConfirmDiscardOpen] = useState(false);

  const isDiffusionParamsOff = !store.imports.withDiffParams;
  const isDiffusionTagsOff = isDiffusionParamsOff || !store.imports.withDiffTags;
  const isFolderToCollectionOff = store.imports.folderToCollMode === "none";
  const isFolderToTagsOff = store.imports.folderToTagsMode === "none";
  const isMediaProgramsOff = !store.imports.withMediaPrograms;

  useEffect(() => {
    handleLoadConfig();
  }, []);

  const handleCancel = () => {
    if (store.hasUnsavedChanges) setIsConfirmDiscardOpen(true);
    else handleClose();
  };

  const handleClose = async () => {
    load.cancel();
    if (store.hasUnsavedChanges) stores.applyConfig(getConfig());

    store.setIsOpen(false);
    store.setHasUnsavedChanges(false);

    return true;
  };

  const handleLoadConfig = () =>
    load.run(async (signal) => {
      const config = await loadConfig(await ipcRenderer.invoke("getConfigPath"));

      signal.throwIfAborted();
      stores.applyConfig(config);
    });

  const handleFolderToCollection = (checked: boolean) =>
    store.setFolderToCollMode(checked ? "withTag" : "none");

  const handleFoldersToTags = (checked: boolean) =>
    store.setFolderToTagsMode(checked ? "hierarchical" : "none");

  const handleMediaProgramLanguage = (language: string) =>
    store.update({ imports: { mediaProgramLanguage: language } });

  const handleMediaProgramMedium = (medium: string) =>
    store.update({ imports: { mediaProgramMedium: medium } });

  const handleMediaProgramType = (type: string) =>
    store.update({ imports: { mediaProgramType: type } });

  const handlePathClick = (setPath: (path: string) => void) => async (event: React.MouseEvent) => {
    event.preventDefault();

    const location = await selectStorageLocation();

    if (location) setPath(location);
  };

  const handleRepair = () => store.repair.setIsOpen(true);

  const handleStorageThreshold = (percent: number) => {
    if (percent === null) return;

    store.setFileStorageThreshold(Math.min(Math.max(percent, 1), 100) / 100);
  };

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
      stores.file.stopFileRefresh();

      const result = await store.save();

      if (!result.success) throw new Error(result.error);

      store.setIsLoading(false);
      store.setHasUnsavedChanges(false);
      toast.success("Settings saved!");
    } catch (err) {
      store.setIsLoading(false);
      toast.error("Failed to save settings.");
    }
  };

  const selectStorageLocation = async () => {
    const res = await dialog.showOpenDialog({ properties: ["openDirectory"] });

    return res.canceled ? undefined : res.filePaths[0];
  };

  const toggleFoldersToTagsCascading = () => store.setFolderToTagsMode("cascading");

  const toggleFoldersToTagsHierarchical = () => store.setFolderToTagsMode("hierarchical");

  return (
    <Modal.Container
      isLoading={store.isLoading}
      onClose={handleCancel}
      height="100%"
      width="100%"
      maxWidth="70rem"
    >
      <LoadingOverlay
        isLoading={load.isLoading}
        sub={<Button text="Cancel" icon="Close" onClick={handleClose} />}
      />

      <Modal.Header>
        <Text preset="title">{"Settings"}</Text>
      </Modal.Header>

      <Modal.Content row overflow="hidden" spacing="1rem">
        <Card flex="none" width="14rem" spacing="0.3rem" overflow="hidden auto">
          {TABS.map((tab) => {
            const isActive = tab.label === activeTab;

            return (
              <Button
                key={tab.label}
                text={tab.label}
                icon={tab.icon}
                onClick={() => setActiveTab(tab.label)}
                color={isActive ? colors.custom.grey : "transparent"}
                colorOnHover={isActive ? colors.custom.grey : colors.foregroundCard}
                textColor={isActive ? colors.custom.white : colors.custom.lightGrey}
                justify="flex-start"
                padding={{ all: "0.5rem 0.7rem" }}
              />
            );
          })}
        </Card>

        <Settings.Section>
          {activeTab === "Database / Servers" && (
            <>
              <Settings.Group
                title="Database"
                rightNode={
                  <Button
                    text="Repair Database"
                    icon="Build"
                    onClick={handleRepair}
                    color={colors.custom.black}
                  />
                }
              >
                <Settings.Grid>
                  <Settings.Field label="Path" description="Changing it restarts the servers." wide>
                    <Settings.Input
                      configKey="db.path"
                      onClick={handlePathClick(store.setDbPath)}
                      flex={1}
                    />
                  </Settings.Field>

                  <Settings.Field label="Port">
                    <Settings.NumInput configKey="ports.db" />
                  </Settings.Field>
                </Settings.Grid>
              </Settings.Group>

              <Settings.Group title="Servers">
                <Settings.Grid>
                  <Settings.Field label="Server Port">
                    <Settings.NumInput configKey="ports.server" />
                  </Settings.Field>

                  <Settings.Field label="Socket Port">
                    <Settings.NumInput configKey="ports.socket" />
                  </Settings.Field>
                </Settings.Grid>
              </Settings.Group>

              <Settings.Group title="File Storage">
                <Settings.Grid>
                  <Settings.Field
                    label="Locations"
                    description="Filled in order, top first."
                    alignTop
                    wide
                  >
                    <Settings.StorageInputs selectLocation={selectStorageLocation} />
                  </Settings.Field>

                  <Settings.Field
                    label="Scratch Folder"
                    description="Intermediate media files. Empty uses the storage locations."
                    wide
                  >
                    <Settings.ScratchInput selectLocation={selectStorageLocation} />
                  </Settings.Field>

                  <Settings.Field
                    label="Full Warning At"
                    description="Marks a location as full in this list."
                  >
                    <Settings.NumInput
                      configKey="db.fileStorage.threshold"
                      value={Math.round(store.db.fileStorage.threshold * 100)}
                      setValue={handleStorageThreshold}
                      adornment="%"
                      minValue={1}
                      maxValue={100}
                    />
                  </Settings.Field>
                </Settings.Grid>
              </Settings.Group>
            </>
          )}

          {activeTab === "Vectors" && (
            <>
              <Settings.Group title="Database">
                <Settings.Grid>
                  <Settings.Field
                    label="Path"
                    description="Restarts the servers. A folder without vectors needs a full Similarity Search Index repair."
                    wide
                  >
                    <Settings.Input
                      configKey="db.vector.path"
                      onClick={handlePathClick(store.setVectorDbPath)}
                      flex={1}
                    />
                  </Settings.Field>

                  <Settings.Field label="Port" description="Restarts the servers.">
                    <Settings.NumInput configKey="ports.vector" />
                  </Settings.Field>

                  <Settings.Field
                    label="CPU Threads"
                    description="Used for searches and index builds. Restarts the servers."
                  >
                    <Settings.NumInput
                      configKey="file.similarity.cpuThreads"
                      minValue={1}
                      maxValue={navigator.hardwareConcurrency}
                    />
                  </Settings.Field>

                  <Settings.Field label="Writer Batch" description="Vectors saved per write.">
                    <Settings.NumInput configKey="file.similarity.writerBatchSize" minValue={1} />
                  </Settings.Field>
                </Settings.Grid>
              </Settings.Group>

              <Settings.Group title="Inference">
                <Settings.Grid>
                  <Settings.Field
                    label="Model Cache Path"
                    description="A new folder downloads the model again."
                    wide
                  >
                    <Settings.Input
                      configKey="file.similarity.modelCachePath"
                      onClick={handlePathClick(store.setSimilarityModelCachePath)}
                      flex={1}
                    />
                  </Settings.Field>

                  <Settings.Field label="Device" description="Hardware that generates new vectors.">
                    <Settings.Dropdown
                      configKey="file.similarity.visual.device"
                      options={SIMILARITY_DEVICE_OPTIONS}
                      width="10rem"
                    />
                  </Settings.Field>

                  <Settings.Field
                    label="Batch Size"
                    description="Thumbnails per inference batch. Higher uses more memory."
                  >
                    <Settings.NumInput
                      configKey="file.similarity.visual.inferenceBatchSize"
                      minValue={1}
                    />
                  </Settings.Field>
                </Settings.Grid>
              </Settings.Group>

              <Settings.Group title="Audio">
                <Settings.Grid>
                  <Settings.Field
                    label="Model"
                    description="Exported to the model cache by scripts/export-ced-onnx.py. Each model and layer keeps its own vectors."
                  >
                    <Settings.Dropdown
                      configKey="file.similarity.audio.model"
                      options={AUDIO_SIMILARITY_MODELS}
                      width="10rem"
                    />
                  </Settings.Field>

                  <Settings.Field
                    label="Layer"
                    description="Final groups sounds by type; Middle may keep finer acoustic detail."
                  >
                    <Settings.Dropdown
                      configKey="file.similarity.audio.layer"
                      options={AUDIO_SIMILARITY_LAYER_OPTIONS}
                      width="8rem"
                    />
                  </Settings.Field>

                  <Settings.Field
                    label="Device"
                    description="Hardware that generates audio vectors."
                  >
                    <Settings.Dropdown
                      configKey="file.similarity.audio.device"
                      options={AUDIO_SIMILARITY_DEVICE_OPTIONS}
                      width="10rem"
                    />
                  </Settings.Field>

                  <Settings.Field
                    label="Batch Size"
                    description="Ten-second chunks per inference batch. Higher uses more memory."
                  >
                    <Settings.NumInput configKey="file.similarity.audio.batchSize" minValue={1} />
                  </Settings.Field>

                  <Settings.Field
                    label="Window"
                    description="Audio each stored vector covers. Changing it regenerates audio vectors."
                  >
                    <Settings.NumInput
                      configKey="file.similarity.audio.windowMs"
                      adornment="ms"
                      minValue={160}
                    />
                  </Settings.Field>

                  <Settings.Field
                    label="Hop"
                    description="Time between window starts. Changing it regenerates audio vectors."
                  >
                    <Settings.NumInput
                      configKey="file.similarity.audio.hopMs"
                      adornment="ms"
                      minValue={160}
                    />
                  </Settings.Field>
                </Settings.Grid>
              </Settings.Group>

              <Settings.Group title="Find Similar">
                <Settings.Grid>
                  <Settings.Field label="Results Limit" description="Results per page.">
                    <Settings.NumInput
                      configKey="file.similarity.defaultLimit"
                      minValue={1}
                      maxValue={CONSTANTS.VECTOR.MAX_SIMILAR_RESULTS}
                    />
                  </Settings.Field>
                </Settings.Grid>
              </Settings.Group>

              <Settings.Group title="Search Index">
                <Settings.Grid>
                  <Settings.Field
                    label="Probes"
                    description="Index partitions checked per duplicate lookup. Higher is more thorough but slower."
                  >
                    <Settings.NumInput
                      configKey="file.similarity.index.ivfPq.nprobes"
                      minValue={1}
                    />
                  </Settings.Field>
                </Settings.Grid>
              </Settings.Group>
            </>
          )}

          {activeTab === "Collections" && (
            <>
              <Settings.Group title="Editor">
                <Settings.Grid>
                  <Settings.Field label="Page Size">
                    <Settings.NumInput
                      configKey="collection.editor.search.pageSize"
                      minValue={1}
                      maxValue={200}
                    />
                  </Settings.Field>

                  <Settings.Field label="Default Sort">
                    <Settings.SortMenu
                      configKey="collection.editor.search.sort"
                      rows={SORT_OPTIONS.FileCollectionFile}
                    />
                  </Settings.Field>

                  <Settings.Field label="File Search Page Size">
                    <Settings.NumInput
                      configKey="collection.editor.fileSearch.pageSize"
                      minValue={1}
                      maxValue={200}
                    />
                  </Settings.Field>
                </Settings.Grid>
              </Settings.Group>

              <Settings.Group title="Manager">
                <Settings.Grid>
                  <Settings.Field label="Page Size">
                    <Settings.NumInput
                      configKey="collection.manager.search.pageSize"
                      minValue={25}
                      maxValue={250}
                    />
                  </Settings.Field>

                  <Settings.Field label="Default Sort">
                    <Settings.SortMenu
                      configKey="collection.manager.search.sort"
                      rows={SORT_OPTIONS.FileCollection}
                    />
                  </Settings.Field>
                </Settings.Grid>
              </Settings.Group>
            </>
          )}

          {activeTab === "Files" && (
            <>
              <Settings.Group title="Search">
                <Settings.Grid>
                  <Settings.Field label="Page Size">
                    <Settings.NumInput
                      configKey="file.search.pageSize"
                      minValue={25}
                      maxValue={250}
                    />
                  </Settings.Field>

                  <Settings.Field label="Default Sort">
                    <Settings.SortMenu configKey="file.search.sort" rows={SORT_OPTIONS.File} />
                  </Settings.Field>
                </Settings.Grid>
              </Settings.Group>

              <Settings.Group title="Display">
                <Settings.Grid>
                  <Settings.Field label="Thumbnail Fit">
                    <Settings.Dropdown
                      configKey="file.fileCardFit"
                      options={FILE_CARD_FIT_OPTIONS}
                      setValue={store.setFileCardFit}
                      width="8rem"
                    />
                  </Settings.Field>

                  <Settings.Field label="Show File Names">
                    <Settings.Checkbox configKey="file.showFileName" width="auto" />
                  </Settings.Field>

                  <Settings.Field label="Hide Unrated Icons">
                    <Settings.Checkbox configKey="file.hideUnratedIcon" width="auto" />
                  </Settings.Field>
                </Settings.Grid>
              </Settings.Group>

              <Settings.Group title="Audio Metadata">
                <Settings.Grid>
                  <Settings.Field label="Waveforms">
                    <Settings.Checkbox configKey="file.waveform.enabled" width="auto" />
                  </Settings.Field>

                  <Settings.Field label="Transcriptions">
                    <Settings.Checkbox configKey="file.transcription.enabled" width="auto" />
                  </Settings.Field>

                  <Settings.Field label="Transcription Model">
                    <Settings.Dropdown
                      configKey="file.transcription.model"
                      options={TRANSCRIPTION_MODELS}
                      setValue={handleTranscriptionModelChange}
                      value={store.file.transcription.model}
                      width="15rem"
                    />
                  </Settings.Field>

                  <Settings.Field label="Quantization">
                    <Settings.Dropdown
                      configKey="file.transcription.quantization"
                      options={TRANSCRIPTION_QUANTIZATION_OPTIONS.filter(({ value }) =>
                        TRANSCRIPTION_MODELS.find(
                          ({ value }) => value === store.file.transcription.model,
                        )?.quantizations.includes(value),
                      )}
                      value={store.file.transcription.quantization}
                      width="8rem"
                    />
                  </Settings.Field>

                  <Settings.Field label="Model Cache Path" wide>
                    <Settings.Input
                      configKey="file.transcription.modelCachePath"
                      onClick={handlePathClick(store.setTranscriptionModelCachePath)}
                      flex={1}
                    />
                  </Settings.Field>
                </Settings.Grid>
              </Settings.Group>

              <Settings.Group title="Deleted Files">
                <Settings.Grid>
                  <Settings.Field label="Keep Metadata">
                    <Settings.Checkbox configKey="file.keepDeletedMetadata" width="auto" />
                  </Settings.Field>
                </Settings.Grid>
              </Settings.Group>

              <Settings.Group title="Formats">
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

                  <Settings.ExtColumn
                    label="Remux to MP4"
                    options={REMUX_EXTS}
                    configKey="file.remuxTypes.toMp4"
                  />
                </UniformList>
              </Settings.Group>

              <Settings.Group title="Media Transformer">
                <Settings.Grid>
                  <Settings.Field label="Page Size">
                    <Settings.NumInput
                      configKey="file.transforms.search.pageSize"
                      minValue={1}
                      maxValue={200}
                    />
                  </Settings.Field>

                  <Settings.Field label="Default Sort">
                    <Settings.SortMenu
                      configKey="file.transforms.search.sort"
                      rows={SORT_OPTIONS.FileTransform}
                    />
                  </Settings.Field>
                </Settings.Grid>
              </Settings.Group>
            </>
          )}

          {activeTab === "Imports" && (
            <View row align="flex-start" spacing="1rem">
              <View column width="16rem" flex="none">
                <Settings.Group title="Ingester Defaults">
                  <View column>
                    <Settings.Checkbox
                      {...INGESTER_CHECKBOX_PROPS}
                      label="Delete on Import"
                      configKey="imports.deleteOnImport"
                    />

                    <Settings.Checkbox
                      {...INGESTER_CHECKBOX_PROPS}
                      label="Ignore Prev. Deleted"
                      configKey="imports.ignorePrevDeleted"
                    />

                    <Settings.Checkbox
                      {...INGESTER_CHECKBOX_PROPS}
                      label="Use Saved Configs"
                      configKey="imports.useSavedConfigs"
                    />

                    <Settings.Checkbox
                      {...INGESTER_CHECKBOX_PROPS}
                      label="New Tags to RegEx"
                      configKey="imports.withNewTagsToRegEx"
                    />

                    <Settings.Checkbox
                      {...INGESTER_CHECKBOX_PROPS}
                      label="File to Tags (RegEx)"
                      configKey="imports.withFileNameToTags"
                    />

                    <Settings.Checkbox
                      {...INGESTER_CHECKBOX_PROPS}
                      label="Folder to Tags"
                      configKey="imports.folderToTagsMode"
                      checked={!isFolderToTagsOff}
                      setChecked={handleFoldersToTags}
                    />

                    <View column margins={{ left: "1rem" }}>
                      <Settings.Checkbox
                        {...INGESTER_CHECKBOX_PROPS}
                        label="Hierarchical"
                        configKey="imports.folderToTagsMode"
                        checked={store.imports.folderToTagsMode.includes("hierarchical")}
                        setChecked={toggleFoldersToTagsHierarchical}
                        disabled={isFolderToTagsOff}
                      />

                      <Settings.Checkbox
                        {...INGESTER_CHECKBOX_PROPS}
                        label="Cascading"
                        configKey="imports.folderToTagsMode"
                        checked={store.imports.folderToTagsMode === "cascading"}
                        setChecked={toggleFoldersToTagsCascading}
                        disabled={isFolderToTagsOff}
                      />

                      <Settings.Checkbox
                        {...INGESTER_CHECKBOX_PROPS}
                        label="Delimited"
                        configKey="imports.withDelimiters"
                        disabled={isFolderToTagsOff}
                      />

                      <Settings.Checkbox
                        {...INGESTER_CHECKBOX_PROPS}
                        label="With RegEx"
                        configKey="imports.withFolderNameRegEx"
                        disabled={isFolderToTagsOff}
                      />
                    </View>

                    <Settings.Checkbox
                      {...INGESTER_CHECKBOX_PROPS}
                      label="Folder to Collection"
                      configKey="imports.folderToCollMode"
                      checked={!isFolderToCollectionOff}
                      setChecked={handleFolderToCollection}
                    />

                    <View column margins={{ left: "1rem" }}>
                      <Settings.Checkbox
                        {...INGESTER_CHECKBOX_PROPS}
                        label="With Tag"
                        configKey="imports.folderToCollMode"
                        checked={store.imports.folderToCollMode === "withTag"}
                        setChecked={store.toggleFolderToCollMode}
                        disabled={isFolderToCollectionOff}
                      />

                      <View row align="center" spacing="0.5rem">
                        <Settings.Checkbox
                          {...INGESTER_CHECKBOX_PROPS}
                          label="Flatten to"
                          configKey="imports.withFlattenTo"
                          disabled={isFolderToCollectionOff}
                        />

                        <Settings.NumInput
                          placeholder="Depth"
                          configKey="imports.flattenTo"
                          value={store.imports.flattenTo}
                          disabled={isFolderToCollectionOff || !store.imports.withFlattenTo}
                          hasHelper={false}
                          width="100%"
                          dense
                        />
                      </View>
                    </View>

                    <Settings.Checkbox
                      {...INGESTER_CHECKBOX_PROPS}
                      label="Media Programs"
                      configKey="imports.withMediaPrograms"
                    />

                    <View
                      column
                      spacing="0.3rem"
                      margins={{ left: "1rem" }}
                      padding={{ all: "0.5rem" }}
                    >
                      <MediaProgramDropdown
                        field="types"
                        placeholder="Type"
                        value={store.imports.mediaProgramType}
                        setValue={handleMediaProgramType}
                        disabled={isMediaProgramsOff}
                        dense
                      />

                      <MediaProgramDropdown
                        field="mediums"
                        placeholder="Medium"
                        value={store.imports.mediaProgramMedium}
                        setValue={handleMediaProgramMedium}
                        disabled={isMediaProgramsOff}
                        dense
                      />

                      <MediaProgramDropdown
                        field="languages"
                        placeholder="Language"
                        value={store.imports.mediaProgramLanguage}
                        setValue={handleMediaProgramLanguage}
                        disabled={isMediaProgramsOff}
                        dense
                      />
                    </View>

                    <Settings.Checkbox
                      {...INGESTER_CHECKBOX_PROPS}
                      label="Sidecar"
                      configKey="imports.withSidecar"
                    />

                    <Settings.Checkbox
                      {...INGESTER_CHECKBOX_PROPS}
                      label="Diffusion Params"
                      configKey="imports.withDiffParams"
                    />

                    <View column margins={{ left: "1rem" }}>
                      <Settings.Checkbox
                        {...INGESTER_CHECKBOX_PROPS}
                        label="With Tags"
                        configKey="imports.withDiffTags"
                        disabled={isDiffusionParamsOff}
                      />

                      <View column margins={{ left: "1rem" }}>
                        <Settings.Checkbox
                          {...INGESTER_CHECKBOX_PROPS}
                          label="Model"
                          configKey="imports.withDiffModel"
                          disabled={isDiffusionTagsOff}
                        />

                        <Settings.Checkbox
                          {...INGESTER_CHECKBOX_PROPS}
                          label="With RegEx"
                          configKey="imports.withDiffRegEx"
                          disabled={isDiffusionTagsOff}
                        />
                      </View>
                    </View>
                  </View>
                </Settings.Group>
              </View>

              <View column flex={1} minWidth={0} spacing="0.5rem">
                <Settings.Group title="Folder Tags">
                  <Settings.Grid pairs={1}>
                    <Settings.Field label="Delimiter">
                      <Settings.Input
                        configKey="imports.folderDelimiter"
                        width="8rem"
                        textAlign="center"
                      />
                    </Settings.Field>
                  </Settings.Grid>
                </Settings.Group>

                <Settings.Group title="Subtitles">
                  <Settings.Grid pairs={1}>
                    <Settings.Field label="Mode">
                      <Settings.Dropdown
                        configKey="imports.subtitleMode"
                        options={[...SUBTITLE_MODES]}
                        width="12rem"
                      />
                    </Settings.Field>
                  </Settings.Grid>
                </Settings.Group>

                <Settings.Group title="Diffusion Tag Labels">
                  <Settings.Grid pairs={1}>
                    <Settings.Field label="Diffusion">
                      <Settings.Input configKey="imports.labelDiff" />
                    </Settings.Field>

                    <Settings.Field label="Model">
                      <Settings.Input configKey="imports.labelDiffModel" />
                    </Settings.Field>

                    <Settings.Field label="Original">
                      <Settings.Input configKey="imports.labelDiffOriginal" />
                    </Settings.Field>

                    <Settings.Field label="Upscaled">
                      <Settings.Input configKey="imports.labelDiffUpscaled" />
                    </Settings.Field>
                  </Settings.Grid>
                </Settings.Group>

                <Settings.Group title="Import Manager">
                  <Settings.Grid pairs={1}>
                    <Settings.Field label="Page Size">
                      <Settings.NumInput
                        configKey="imports.manager.search.pageSize"
                        minValue={1}
                        maxValue={200}
                      />
                    </Settings.Field>

                    <Settings.Field label="Default Sort">
                      <Settings.SortMenu
                        configKey="imports.manager.search.sort"
                        rows={SORT_OPTIONS.FileImportBatch}
                      />
                    </Settings.Field>
                  </Settings.Grid>
                </Settings.Group>
              </View>
            </View>
          )}

          {activeTab === "Media Programs" && (
            <>
              <Settings.Group title="Manager">
                <Settings.Grid>
                  <Settings.Field label="Page Size">
                    <Settings.NumInput
                      configKey="mediaPrograms.manager.search.pageSize"
                      minValue={10}
                      maxValue={250}
                    />
                  </Settings.Field>

                  <Settings.Field label="Default Sort">
                    <Settings.SortMenu
                      configKey="mediaPrograms.manager.search.sort"
                      rows={SORT_OPTIONS.MediaProgram}
                    />
                  </Settings.Field>
                </Settings.Grid>
              </Settings.Group>

              <Settings.Group title="Lists">
                <UniformList row spacing="0.5rem" height="15rem">
                  <Settings.ListInput label="Types" configKey="mediaPrograms.types" />

                  <Settings.ListInput label="Mediums" configKey="mediaPrograms.mediums" />

                  <Settings.ListInput label="Languages" configKey="mediaPrograms.languages" />
                </UniformList>
              </Settings.Group>
            </>
          )}

          {activeTab === "Tags" && (
            <Settings.Group title="Manager">
              <Settings.Grid>
                <Settings.Field label="Page Size">
                  <Settings.NumInput
                    configKey="tags.manager.search.pageSize"
                    minValue={1}
                    maxValue={200}
                  />
                </Settings.Field>

                <Settings.Field label="Default Sort">
                  <Settings.SortMenu configKey="tags.manager.search.sort" rows={SORT_OPTIONS.Tag} />
                </Settings.Field>
              </Settings.Grid>
            </Settings.Group>
          )}

          {activeTab === "Developer" && (
            <Settings.Group title="Dev Tools">
              <Settings.Grid>
                <Settings.Field label="Home Window">
                  <Settings.Dropdown
                    configKey="dev.devTools.home"
                    options={DEV_TOOLS_MODES}
                    width="10rem"
                  />
                </Settings.Field>

                <Settings.Field label="Search Window">
                  <Settings.Dropdown
                    configKey="dev.devTools.search"
                    options={DEV_TOOLS_MODES}
                    width="10rem"
                  />
                </Settings.Field>

                <Settings.Field label="Carousel Window">
                  <Settings.Dropdown
                    configKey="dev.devTools.carousel"
                    options={DEV_TOOLS_MODES}
                    width="10rem"
                  />
                </Settings.Field>
              </Settings.Grid>
            </Settings.Group>
          )}
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
