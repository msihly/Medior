import { useMemo } from "react";
import {
  Card,
  Checkbox,
  Comp,
  DateRange,
  FilterMenu,
  Input,
  LogOpsInput,
  NumRange,
  TagInput,
  View,
} from "medior/components";
import { FileSearch, SORT_OPTIONS } from "medior/store";
import { colors, getConfig } from "medior/utils/client";
import { ImageType, VideoType } from "medior/utils/common";

export interface FileFilterMenuProps {
  color?: string;
  store: FileSearch;
}

export const FileFilterMenu = Comp(({ color = colors.foreground, store }: FileFilterMenuProps) => {
  const toggleArchiveOpen = () => store.setIsArchived(!store.isArchived);

  const toggleHasDiffParams = () => store.setHasDiffParams(!store.hasDiffParams);

  const toggleIsCorrupted = () => store.setIsCorrupted(!store.isCorrupted);

  return (
    <FilterMenu store={store} color={color} sortOptions={SORT_OPTIONS.File} width="100%">
      <View row height="16.5rem" spacing="0.5rem">
        <Card flex={1}>
          <TagInput
            header="Tags"
            value={store.tags}
            onChange={store.setTags}
            width="12rem"
            hasCreate
            hasDelete
            hasEditor
            hasSearchMenu
          />
        </Card>

        <Card height="100%" width="8rem" spacing="0.5rem">
          <LogOpsInput
            header="# of Tags"
            logOpValue={store.numOfTags.logOp}
            numValue={store.numOfTags.value}
            setLogOpValue={store.setNumOfTagsOp}
            setNumValue={store.setNumOfTagsValue}
            numInputProps={{ maxValue: 50, minValue: 0 }}
          />

          <LogOpsInput
            header="Rating"
            logOpValue={store.rating.logOp}
            numValue={store.rating.value}
            setLogOpValue={store.setRatingOp}
            setNumValue={store.setRatingValue}
            numInputProps={{ maxValue: 9, minValue: 0 }}
          />

          <View column>
            <Checkbox
              label="Archived"
              checked={store.isArchived}
              setChecked={toggleArchiveOpen}
              color={colors.custom.red}
              flex="none"
            />

            <Checkbox
              label="Corrupted"
              checked={store.isCorrupted}
              setChecked={toggleIsCorrupted}
              color={colors.custom.orange}
              flex="none"
            />

            <Checkbox
              label="Diffusion"
              checked={store.hasDiffParams}
              setChecked={toggleHasDiffParams}
              flex="none"
            />

            {/* <Checkbox
                label="Faces"
                checked={store.hasFaces}
                setChecked={toggleHasFaces}
                flex="none"
              /> */}
          </View>
        </Card>

        <View row spacing="0.5rem">
          <Card overflow="auto">
            <ExtColumn {...{ store }} type="Image" />
          </Card>

          <Card overflow="auto">
            <ExtColumn {...{ store }} type="Video" />
          </Card>
        </View>
      </View>

      <View row spacing="0.5rem">
        <Card flex="none" width="20rem" spacing="0.5rem">
          <DateRange
            header="Date Created"
            startDate={store.dateCreatedStart}
            setStartDate={store.setDateCreatedStart}
            endDate={store.dateCreatedEnd}
            setEndDate={store.setDateCreatedEnd}
          />

          <DateRange
            header="Date Modified"
            startDate={store.dateModifiedStart}
            setStartDate={store.setDateModifiedStart}
            endDate={store.dateModifiedEnd}
            setEndDate={store.setDateModifiedEnd}
          />
        </Card>

        <Card flex={1} width="12rem" spacing="0.5rem">
          <NumRange
            header="Height"
            min={store.minHeight}
            max={store.maxHeight}
            setMin={store.setMinHeight}
            setMax={store.setMaxHeight}
          />

          <NumRange
            header="Width"
            min={store.minWidth}
            max={store.maxWidth}
            setMin={store.setMinWidth}
            setMax={store.setMaxWidth}
          />
        </Card>
      </View>

      <Card flex={1} spacing="0.5rem">
        <Input
          header="Original File Path"
          value={store.originalPath}
          setValue={store.setOriginalPath}
        />
      </Card>
    </FilterMenu>
  );
});

interface ExtCheckboxProps {
  ext: ImageType | VideoType;
  label?: string;
  store: FileSearch;
  type: "Image" | "Video";
}

const ExtCheckbox = Comp(({ ext, label = null, store, type }: ExtCheckboxProps) => {
  return (
    <Checkbox
      label={label || ext}
      checked={type === "Image" ? store.selectedImageTypes[ext] : store.selectedVideoTypes[ext]}
      setChecked={(checked) =>
        type === "Image"
          ? store.setSelectedImageTypes({ [ext]: checked })
          : store.setSelectedVideoTypes({ [ext]: checked })
      }
    />
  );
});

interface ExtColumnProps {
  store: FileSearch;
  type: "Image" | "Video";
}

const ExtColumn = Comp(({ store, type }: ExtColumnProps) => {
  const config = getConfig();

  const configTypes: ExtCheckboxProps["ext"][] =
    type === "Image"
      ? (config.file.imageTypes as ImageType[])
      : (config.file.videoTypes as VideoType[]);
  const storeTypes = type === "Image" ? store.selectedImageTypes : store.selectedVideoTypes;

  const [isAllSelected, isAnySelected] = useMemo(() => {
    const allTypes = Object.values(storeTypes);
    const selectedTypes = allTypes.filter((t) => t === true);
    const isAllSelected = allTypes.length === selectedTypes.length;
    const isAnySelected = selectedTypes.length > 0 && selectedTypes.length !== allTypes.length;
    return [isAllSelected, isAnySelected];
  }, [storeTypes]);

  const toggleTypes = () => {
    const newTypes = Object.fromEntries(configTypes.map((t) => [t, isAllSelected ? false : true]));
    if (type === "Image") store.setSelectedImageTypes(newTypes);
    else store.setSelectedVideoTypes(newTypes);
  };

  return (
    <>
      <Checkbox
        label={`${type}s`}
        checked={isAllSelected}
        indeterminate={!isAllSelected && isAnySelected}
        setChecked={toggleTypes}
      />

      <View column margins={{ left: "0.5rem" }} overflow="hidden auto">
        {configTypes.map((ext) => (
          <ExtCheckbox key={ext} {...{ ext, store, type }} />
        ))}
      </View>
    </>
  );
});
