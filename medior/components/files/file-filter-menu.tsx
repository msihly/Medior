import { useMemo } from "react";
import { FileSearch, SORT_OPTIONS, TagOption, observer } from "medior/store";
import {
  Card,
  Checkbox,
  DateRange,
  FilterMenu,
  LogOpsInput,
  NumRange,
  TagInput,
  View,
} from "medior/components";
import { colors, getConfig, ImageType, LogicalOp, useDeepMemo, VideoType } from "medior/utils";

export interface FileFilterMenuProps {
  color?: string;
  store: FileSearch;
}

export const FileFilterMenu = observer(
  ({ color = colors.foreground, store }: FileFilterMenuProps) => {
    const tags = useDeepMemo(store.tags);

    const setDateCreatedEnd = (val: string) => store.setDateCreatedEnd(val);

    const setDateCreatedStart = (val: string) => store.setDateCreatedStart(val);

    const setDateModifiedEnd = (val: string) => store.setDateModifiedEnd(val);

    const setDateModifiedStart = (val: string) => store.setDateModifiedStart(val);

    const setMaxHeight = (val: number) => store.setMaxHeight(val);

    const setMaxWidth = (val: number) => store.setMaxWidth(val);

    const setMinHeight = (val: number) => store.setMinHeight(val);

    const setMinWidth = (val: number) => store.setMinWidth(val);

    const setNumOfTagsOp = (val: LogicalOp | "") => store.setNumOfTagsOp(val);

    const setNumOfTagsValue = (val: number) => store.setNumOfTagsValue(val);

    const setRatingOp = (val: LogicalOp | "") => store.setRatingOp(val);

    const setRatingValue = (val: number) => store.setRatingValue(val);

    const setTags = (val: TagOption[]) => store.setTags(val);

    const toggleArchiveOpen = () => store.setIsArchiveOpen(!store.isArchiveOpen);

    const toggleHasDiffParams = () => store.setHasDiffParams(!store.hasDiffParams);

    return (
      <FilterMenu store={store} color={color} sortOptions={SORT_OPTIONS.File} width="100%">
        <View row height="14rem" spacing="0.5rem">
          <Card flex={1}>
            <TagInput
              header="Tags"
              value={tags}
              onChange={setTags}
              width="10rem"
              hasCreate
              hasDelete
              hasEditor
              hasSearchMenu
            />
          </Card>

          <Card width="8rem" spacing="0.5rem">
            <LogOpsInput
              header="# of Tags"
              logOpValue={store.numOfTagsOp}
              numValue={store.numOfTagsValue}
              setLogOpValue={setNumOfTagsOp}
              setNumValue={setNumOfTagsValue}
              numInputProps={{ maxValue: 50, minValue: 0 }}
            />

            <LogOpsInput
              header="Rating"
              logOpValue={store.ratingOp}
              numValue={store.ratingValue}
              setLogOpValue={setRatingOp}
              setNumValue={setRatingValue}
              numInputProps={{ maxValue: 9, minValue: 0 }}
            />

            <View column>
              <Checkbox
                label="Archived"
                checked={store.isArchiveOpen}
                setChecked={toggleArchiveOpen}
                flex="none"
              />

              <Checkbox
                label="Diffusion"
                checked={store.hasDiffParams}
                setChecked={toggleHasDiffParams}
                flex="none"
              />
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
          <Card width="20rem" spacing="0.5rem">
            <DateRange
              header="Date Created"
              startDate={store.dateCreatedStart}
              setStartDate={setDateCreatedStart}
              endDate={store.dateCreatedEnd}
              setEndDate={setDateCreatedEnd}
            />

            <DateRange
              header="Date Modified"
              startDate={store.dateModifiedStart}
              setStartDate={setDateModifiedStart}
              endDate={store.dateModifiedEnd}
              setEndDate={setDateModifiedEnd}
            />
          </Card>

          <Card flex={1} width="12rem" spacing="0.5rem">
            <NumRange
              header="Height"
              min={store.minHeight}
              max={store.maxHeight}
              setMin={setMinHeight}
              setMax={setMaxHeight}
            />

            <NumRange
              header="Width"
              min={store.minWidth}
              max={store.maxWidth}
              setMin={setMinWidth}
              setMax={setMaxWidth}
            />
          </Card>
        </View>
      </FilterMenu>
    );
  }
);

interface ExtCheckboxProps {
  ext: ImageType | VideoType;
  label?: string;
  store: FileSearch;
  type: "Image" | "Video";
}

const ExtCheckbox = observer(({ ext, label = null, store, type }: ExtCheckboxProps) => {
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

const ExtColumn = observer(({ store, type }: ExtColumnProps) => {
  const config = getConfig();

  const configTypes: ExtCheckboxProps["ext"][] =
    type === "Image" ? config.file.imageTypes : config.file.videoTypes;
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
