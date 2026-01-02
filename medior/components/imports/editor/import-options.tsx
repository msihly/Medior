import { Divider } from "@mui/material";
import { Button, Checkbox, CheckboxProps, Comp, NumInput, View } from "medior/components";
import { Ingester, Reingester } from "medior/store";
import { colors } from "medior/utils/client";

export interface ImportOptionsProps {
  scan: () => Promise<void>;
  store: Ingester | Reingester;
}

export const ImportOptions = Comp(({ scan, store }: ImportOptionsProps) => {
  const options = store.options;

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
        checked={options.deleteOnImport}
        setChecked={options.setDeleteOnImport}
      />

      <Checkbox
        {...checkboxProps}
        label="Ignore Prev. Deleted"
        checked={options.ignorePrevDeleted}
        setChecked={options.setIgnorePrevDeleted}
      />

      <Divider />

      <Checkbox
        {...checkboxProps}
        label="New Tags to RegEx"
        checked={options.withNewTagsToRegEx}
        setChecked={options.setWithNewTagsToRegEx}
      />

      <Divider />

      <Checkbox
        {...checkboxProps}
        label="File to Tags (RegEx)"
        checked={options.withFileNameToTags}
        setChecked={options.setWithFileNameToTags}
      />

      <Divider />

      <Checkbox
        {...checkboxProps}
        label="Folder to Tags"
        checked={options.folderToTagsMode !== "none"}
        setChecked={options.toggleFolderToTags}
      />

      <View column margins={{ left: "1rem" }}>
        <Checkbox
          {...checkboxProps}
          label="Hierarchical"
          checked={options.folderToTagsMode.includes("hierarchical")}
          setChecked={options.toggleFolderToTagsHierarchical}
          disabled={checkboxProps.disabled || options.folderToTagsMode === "none"}
        />

        <Checkbox
          {...checkboxProps}
          label="Cascading"
          checked={options.folderToTagsMode === "cascading"}
          setChecked={options.toggleFolderToTagsCascading}
          disabled={checkboxProps.disabled || options.folderToTagsMode === "none"}
        />

        <Checkbox
          {...checkboxProps}
          label="Delimited"
          checked={options.withDelimiters}
          setChecked={options.setWithDelimiters}
          disabled={checkboxProps.disabled || options.folderToTagsMode === "none"}
        />

        <Checkbox
          {...checkboxProps}
          label="With RegEx"
          checked={options.withFolderNameRegEx}
          setChecked={options.setWithFolderNameRegEx}
          disabled={checkboxProps.disabled || options.folderToTagsMode === "none"}
        />
      </View>

      <Divider />

      <Checkbox
        {...checkboxProps}
        label="Folder to Collection"
        checked={options.folderToCollectionMode !== "none"}
        setChecked={options.toggleFolderToCollection}
      />

      <View column margins={{ left: "1rem" }}>
        <Checkbox
          {...checkboxProps}
          label="With Tag"
          checked={options.folderToCollectionMode === "withTag"}
          setChecked={options.toggleFolderToCollWithTag}
        />

        <View row align="center" spacing="0.5rem">
          <Checkbox
            {...checkboxProps}
            label="Flatten to"
            checked={options.withFlattenTo}
            setChecked={options.setWithFlattenTo}
            disabled={checkboxProps.disabled || options.folderToCollectionMode === "none"}
          />

          <NumInput
            placeholder="Depth"
            value={options.flattenTo}
            setValue={options.setFlattenTo}
            disabled={options.folderToCollectionMode === "none" || !options.withFlattenTo}
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
        checked={options.withSidecar}
        setChecked={options.setWithSidecar}
      />

      <Divider />

      <Checkbox
        {...checkboxProps}
        label="Diffusion Params"
        checked={options.withDiffusionParams}
        setChecked={options.setWithDiffusionParams}
      />

      <View column margins={{ left: "1rem" }}>
        <Checkbox
          {...checkboxProps}
          label="With Tags"
          checked={options.withDiffusionTags}
          setChecked={options.setWithDiffusionTags}
          disabled={checkboxProps.disabled || !options.withDiffusionParams}
        />

        <View column margins={{ left: "1rem" }}>
          <Checkbox
            {...checkboxProps}
            label="Model"
            checked={options.withDiffusionModel}
            setChecked={options.setWithDiffusionModel}
            disabled={
              checkboxProps.disabled || !options.withDiffusionParams || !options.withDiffusionTags
            }
          />

          <Checkbox
            {...checkboxProps}
            label="With RegEx"
            checked={options.withDiffusionRegExMaps}
            setChecked={options.setWithDiffusionRegExMaps}
            disabled={
              checkboxProps.disabled || !options.withDiffusionParams || !options.withDiffusionTags
            }
          />
        </View>
      </View>

      <Divider />

      <Checkbox
        {...checkboxProps}
        label="Remux to MP4"
        checked={options.withRemux}
        setChecked={options.setWithRemux}
      />
    </>
  );
});
