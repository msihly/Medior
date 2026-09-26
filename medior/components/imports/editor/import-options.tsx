import { Divider } from "@mui/material";
import { Button, Checkbox, CheckboxProps, Comp, NumInput, View } from "medior/components";
import { Ingester, Reingester } from "medior/store";
import { colors } from "medior/utils/client";

export interface ImportOptionsProps {
  scan: () => Promise<void>;
  store: Ingester | Reingester;
}

export const ImportOptions = Comp(({ scan, store }: ImportOptionsProps) => {
  const checkboxProps: Partial<CheckboxProps> = {
    disabled: store.isDisabled,
    flex: "initial",
    padding: { all: "0.5rem" },
  };

  return (
    <>
      <Button
        text="Scan"
        icon="Cached"
        onClick={scan}
        disabled={store.isDisabled}
        color={store.hasChangesSinceLastScan ? colors.custom.purple : colors.custom.blue}
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

      <Divider />

      <Checkbox
        {...checkboxProps}
        label="Use Saved Configs"
        checked={store.options.useSavedConfigs}
        setChecked={store.options.setUseSavedConfigs}
      />

      <Divider />

      <Checkbox
        {...checkboxProps}
        label="New Tags to RegEx"
        checked={store.options.withNewTagsToRegEx}
        setChecked={store.options.setWithNewTagsToRegEx}
      />

      <Divider />

      <Checkbox
        {...checkboxProps}
        label="File to Tags (RegEx)"
        checked={store.options.withFileNameToTags}
        setChecked={store.options.setWithFileNameToTags}
      />

      <Divider />

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

      <Divider />

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

      <Divider />

      <Checkbox
        {...checkboxProps}
        label="Sidecar"
        checked={store.options.withSidecar}
        setChecked={store.options.setWithSidecar}
      />

      <Divider />

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
