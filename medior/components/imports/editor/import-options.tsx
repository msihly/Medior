import {
  Button,
  Checkbox,
  CheckboxProps,
  Comp,
  Divider,
  MediaProgramDropdown,
  NumInput,
  View,
} from "medior/components";
import { Ingester, Reingester } from "medior/store";
import { colors, makeClasses } from "medior/utils/client";

export interface ImportOptionsProps {
  scan: () => Promise<void>;
  store: Ingester | Reingester;
}

export const ImportOptions = Comp(({ scan, store }: ImportOptionsProps) => {
  const { css } = useClasses(null);

  const checkboxProps: Partial<CheckboxProps> = {
    disabled: store.isDisabled,
    flex: "initial",
    padding: { all: "0.5rem" },
  };

  const handleMediaProgramLanguage = (language: string) => {
    store.options.setMediaProgramLanguage(language);
    store.setMediaProgramDefaults({ language });
  };

  const handleMediaProgramMedium = (medium: string) => {
    store.options.setMediaProgramMedium(medium);
    store.setMediaProgramDefaults({ medium });
  };

  const handleMediaProgramType = (type: string) => {
    store.options.setMediaProgramType(type);
    store.setMediaProgramDefaults({ type });
  };

  return (
    <>
      <Button
        text="Scan"
        icon="Cached"
        onClick={scan}
        disabled={store.isDisabled}
        color={store.hasChangesSinceLastScan ? colors.custom.purple : colors.custom.blue}
        className={css.scanButton}
      />

      <Checkbox
        {...checkboxProps}
        label="Delete on Import"
        checked={store.options.deleteOnImport}
        setChecked={store.options.setDeleteOnImport}
      />

      <Checkbox
        {...checkboxProps}
        label="Ignore Prev. Deleted"
        checked={store.options.ignorePrevDeleted}
        setChecked={store.options.setIgnorePrevDeleted}
      />

      <Divider flexItem={false} />

      <Checkbox
        {...checkboxProps}
        label="Use Saved Configs"
        checked={store.options.useSavedConfigs}
        setChecked={store.options.setUseSavedConfigs}
      />

      <Divider flexItem={false} />

      <Checkbox
        {...checkboxProps}
        label="New Tags to RegEx"
        checked={store.options.withNewTagsToRegEx}
        setChecked={store.options.setWithNewTagsToRegEx}
      />

      <Divider flexItem={false} />

      <Checkbox
        {...checkboxProps}
        label="File to Tags (RegEx)"
        checked={store.options.withFileNameToTags}
        setChecked={store.options.setWithFileNameToTags}
      />

      <Divider flexItem={false} />

      <Checkbox
        {...checkboxProps}
        label="Folder to Tags"
        checked={store.options.folderToTagsMode !== "none"}
        setChecked={store.options.toggleFolderToTags}
      />

      <View column margins={{ left: "1rem" }}>
        <Checkbox
          {...checkboxProps}
          label="Hierarchical"
          checked={store.options.folderToTagsMode.includes("hierarchical")}
          setChecked={store.options.toggleFolderToTagsHierarchical}
          disabled={checkboxProps.disabled || store.options.folderToTagsMode === "none"}
        />

        <Checkbox
          {...checkboxProps}
          label="Cascading"
          checked={store.options.folderToTagsMode === "cascading"}
          setChecked={store.options.toggleFolderToTagsCascading}
          disabled={checkboxProps.disabled || store.options.folderToTagsMode === "none"}
        />

        <Checkbox
          {...checkboxProps}
          label="Delimited"
          checked={store.options.withDelimiters}
          setChecked={store.options.setWithDelimiters}
          disabled={checkboxProps.disabled || store.options.folderToTagsMode === "none"}
        />

        <Checkbox
          {...checkboxProps}
          label="With RegEx"
          checked={store.options.withFolderNameRegEx}
          setChecked={store.options.setWithFolderNameRegEx}
          disabled={checkboxProps.disabled || store.options.folderToTagsMode === "none"}
        />
      </View>

      <Divider flexItem={false} />

      <Checkbox
        {...checkboxProps}
        label="Folder to Collection"
        checked={store.options.folderToCollectionMode !== "none"}
        setChecked={store.options.toggleFolderToCollection}
      />

      <View column margins={{ left: "1rem" }}>
        <Checkbox
          {...checkboxProps}
          label="With Tag"
          checked={store.options.folderToCollectionMode === "withTag"}
          setChecked={store.options.toggleFolderToCollWithTag}
          disabled={checkboxProps.disabled || store.options.folderToCollectionMode === "none"}
        />

        <View row align="center" spacing="0.5rem">
          <Checkbox
            {...checkboxProps}
            label="Flatten to"
            checked={store.options.withFlattenTo}
            setChecked={store.options.setWithFlattenTo}
            disabled={checkboxProps.disabled || store.options.folderToCollectionMode === "none"}
          />

          <NumInput
            placeholder="Depth"
            value={store.options.flattenTo}
            setValue={store.options.setFlattenTo}
            disabled={
              store.options.folderToCollectionMode === "none" || !store.options.withFlattenTo
            }
            hasHelper={false}
            textAlign="center"
            dense
          />
        </View>
      </View>

      <Divider flexItem={false} />

      <Checkbox
        {...checkboxProps}
        label="Media Programs"
        checked={store.options.withMediaPrograms}
        setChecked={store.options.setWithMediaPrograms}
      />

      <View column spacing="0.3rem" margins={{ left: "1rem" }} padding={{ all: "0.5rem" }}>
        <MediaProgramDropdown
          field="types"
          placeholder="Type"
          value={store.options.mediaProgramType}
          setValue={handleMediaProgramType}
          disabled={store.isDisabled || !store.options.withMediaPrograms}
          dense
        />

        <MediaProgramDropdown
          field="mediums"
          placeholder="Medium"
          value={store.options.mediaProgramMedium}
          setValue={handleMediaProgramMedium}
          disabled={store.isDisabled || !store.options.withMediaPrograms}
          dense
        />

        <MediaProgramDropdown
          field="languages"
          placeholder="Language"
          value={store.options.mediaProgramLanguage}
          setValue={handleMediaProgramLanguage}
          disabled={store.isDisabled || !store.options.withMediaPrograms}
          dense
        />
      </View>

      <Divider flexItem={false} />

      <Checkbox
        {...checkboxProps}
        label="Sidecar"
        checked={store.options.withSidecar}
        setChecked={store.options.setWithSidecar}
      />

      <Divider flexItem={false} />

      <Checkbox
        {...checkboxProps}
        label="Diffusion Params"
        checked={store.options.withDiffusionParams}
        setChecked={store.options.setWithDiffusionParams}
      />

      <View column margins={{ left: "1rem" }}>
        <Checkbox
          {...checkboxProps}
          label="With Tags"
          checked={store.options.withDiffusionTags}
          setChecked={store.options.setWithDiffusionTags}
          disabled={checkboxProps.disabled || !store.options.withDiffusionParams}
        />

        <View column margins={{ left: "1rem" }}>
          <Checkbox
            {...checkboxProps}
            label="Model"
            checked={store.options.withDiffusionModel}
            setChecked={store.options.setWithDiffusionModel}
            disabled={
              checkboxProps.disabled ||
              !store.options.withDiffusionParams ||
              !store.options.withDiffusionTags
            }
          />

          <Checkbox
            {...checkboxProps}
            label="With RegEx"
            checked={store.options.withDiffusionRegExMaps}
            setChecked={store.options.setWithDiffusionRegExMaps}
            disabled={
              checkboxProps.disabled ||
              !store.options.withDiffusionParams ||
              !store.options.withDiffusionTags
            }
          />
        </View>
      </View>
    </>
  );
});

const useClasses = makeClasses({
  scanButton: {
    flexShrink: 0,
  },
});
