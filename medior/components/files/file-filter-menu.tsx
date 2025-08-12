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
import { ImageExt, VideoCodec, VideoExt } from "medior/utils/common";

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
            <ExtColumn {...{ store }} type="ImageExt" />
          </Card>

          <Card overflow="auto">
            <ExtColumn {...{ store }} type="VideoExt" />
          </Card>

          <Card overflow="auto">
            <ExtColumn {...{ store }} type="VideoCodec" />
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

          <Input
            header="Original File Path"
            value={store.originalPath}
            setValue={store.setOriginalPath}
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

          <NumRange
            header="Size"
            min={store.minSize}
            max={store.maxSize}
            setMin={store.setMinSize}
            setMax={store.setMaxSize}
          />
        </Card>

        <Card flex={1} width="12rem" spacing="0.5rem">
          <LogOpsInput
            header="Bitrate"
            logOpValue={store.bitrate.logOp}
            numValue={store.bitrate.value}
            setLogOpValue={store.setRatingOp}
            setNumValue={store.setRatingValue}
            numInputProps={{ minValue: 0 }}
          />

          <LogOpsInput
            header="Duration"
            logOpValue={store.rating.logOp}
            numValue={store.rating.value}
            setLogOpValue={store.setRatingOp}
            setNumValue={store.setRatingValue}
            numInputProps={{ minValue: 0 }}
          />

          <LogOpsInput
            header="FPS"
            logOpValue={store.frameRate.logOp}
            numValue={store.frameRate.value}
            setLogOpValue={store.setFrameRateOp}
            setNumValue={store.setFrameRateValue}
            numInputProps={{ minValue: 0 }}
          />
        </Card>
      </View>
    </FilterMenu>
  );
});

interface ExtCheckboxProps {
  ext: ImageExt | VideoCodec | VideoExt;
  label?: string;
  store: FileSearch;
  type: "ImageExt" | "VideoCodec" | "VideoExt";
}

const ExtCheckbox = Comp(({ ext, label = null, store, type }: ExtCheckboxProps) => {
  return (
    <Checkbox
      label={label || ext}
      checked={
        type === "ImageExt"
          ? store.selectedImageExts[ext]
          : type === "VideoExt"
            ? store.selectedVideoExts[ext]
            : store.selectedVideoCodecs[ext]
      }
      setChecked={(checked) =>
        type === "ImageExt"
          ? store.setSelectedImageExts({ [ext]: checked })
          : type === "VideoExt"
            ? store.setSelectedVideoExts({ [ext]: checked })
            : store.setSelectedVideoCodecs({ [ext]: checked })
      }
    />
  );
});

interface ExtColumnProps extends Pick<ExtCheckboxProps, "store" | "type"> {}

const ExtColumn = Comp(({ store, type }: ExtColumnProps) => {
  const config = getConfig();

  const configTypes: ExtCheckboxProps["ext"][] =
    type === "ImageExt"
      ? (config.file.imageExts as ImageExt[])
      : type === "VideoExt"
        ? (config.file.videoExts as VideoExt[])
        : (config.file.videoCodecs as VideoCodec[]);

  const storeTypes =
    type === "ImageExt"
      ? store.selectedImageExts
      : type === "VideoExt"
        ? store.selectedVideoExts
        : store.selectedVideoCodecs;

  const [isAllSelected, isAnySelected] = useMemo(() => {
    const allTypes = Object.values(storeTypes);
    const selectedTypes = allTypes.filter((t) => t === true);
    const isAllSelected = allTypes.length === selectedTypes.length;
    const isAnySelected = selectedTypes.length > 0 && selectedTypes.length !== allTypes.length;
    return [isAllSelected, isAnySelected];
  }, [storeTypes]);

  const toggleTypes = () => {
    const newTypes = Object.fromEntries(configTypes.map((t) => [t, isAllSelected ? false : true]));
    if (type === "ImageExt") store.setSelectedImageExts(newTypes);
    else if (type === "VideoExt") store.setSelectedVideoExts(newTypes);
    else store.setSelectedVideoCodecs(newTypes);
  };

  return (
    <>
      <Checkbox
        label={type === "ImageExt" ? "Images" : type === "VideoExt" ? "Videos" : "Codecs"}
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
