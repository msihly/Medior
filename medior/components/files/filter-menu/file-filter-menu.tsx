import { useState } from "react";
import { SORT_OPTIONS } from "medior/store/_generated";
import {
  Card,
  Checkbox,
  Comp,
  DateRange,
  FileFilter,
  FilterMenu,
  Input,
  LogOpsInput,
  NumRange,
  TagInput,
  View,
} from "medior/components";
import { FileSearch } from "medior/store";
import { colors, getConfig } from "medior/utils/client";
import { AudioCodec, durationToSeconds, ImageExt, VideoCodec, VideoExt } from "medior/utils/common";

export interface FileFilterMenuProps {
  color?: string;
  store: FileSearch;
}

export const FileFilterMenu = Comp(({ color = colors.foreground, store }: FileFilterMenuProps) => {
  const config = getConfig();

  const [bitrate, _setBitrate] = useState<number>(null);
  const [duration, _setDuration] = useState<string>("");
  const [maxSize, _setMaxSize] = useState<number>(null);
  const [minSize, _setMinSize] = useState<number>(null);

  const setBitrate = (val: number) => {
    store.setBitrateValue(val * 1000);
    _setBitrate(val);
  };

  const setDuration = (val: string) => {
    const parsedSeconds = val.length > 0 ? durationToSeconds(val) : null;
    store.setDurationValue(parsedSeconds);
    _setDuration(val);
  };

  const setMaxSize = (val: number) => {
    store.setMaxSize(Number.isInteger(val) ? val * 1000 : null);
    _setMaxSize(val);
  };

  const setMinSize = (val: number) => {
    store.setMinSize(Number.isInteger(val) ? val * 1000 : null);
    _setMinSize(val);
  };

  const toggleArchiveOpen = () => store.setIsArchived(!store.isArchived);

  const toggleHasDiffParams = () => store.setHasDiffParams(!store.hasDiffParams);

  const toggleIsCorrupted = () =>
    store.setIsCorrupted(
      store.isCorrupted === true ? false : store.isCorrupted === false ? null : true,
    );

  const toggleIsModified = () =>
    store.setIsModified(
      store.isModified === true ? false : store.isModified === false ? null : true,
    );

  return (
    <FilterMenu store={store} color={color} sortOptions={SORT_OPTIONS.File} width="100%">
      <View row height="18.5rem" spacing="0.5rem">
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
              indeterminate={store.isCorrupted === false}
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

            <Checkbox
              label="Modified"
              checked={store.isModified}
              indeterminate={store.isModified === false}
              setChecked={toggleIsModified}
              color={colors.custom.purple}
              flex="none"
            />
          </View>
        </Card>

        <View row spacing="0.5rem">
          <Card width="9rem" overflow="auto">
            <FileFilter.ExtColumn
              label="Audio"
              configTypes={config.file.audioCodecs as AudioCodec[]}
              selected={store.selectedAudioCodecs}
              setSelected={store.setSelectedAudioCodecs}
            />
          </Card>

          <Card width="9rem" overflow="auto">
            <FileFilter.ExtColumn
              label="Images"
              configTypes={config.file.imageExts as ImageExt[]}
              selected={store.selectedImageExts}
              setSelected={store.setSelectedImageExts}
            />
          </Card>

          <Card width="9rem" overflow="auto">
            <FileFilter.ExtColumn
              label="Videos"
              configTypes={config.file.videoExts as VideoExt[]}
              selected={store.selectedVideoExts}
              setSelected={store.setSelectedVideoExts}
            />
          </Card>

          <Card width="9rem" overflow="auto">
            <FileFilter.ExtColumn
              label="V-Codecs"
              configTypes={config.file.videoCodecs as VideoCodec[]}
              selected={store.selectedVideoCodecs}
              setSelected={store.setSelectedVideoCodecs}
            />
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
            numInputProps={{ adornment: "px" }}
          />

          <NumRange
            header="Width"
            min={store.minWidth}
            max={store.maxWidth}
            setMin={store.setMinWidth}
            setMax={store.setMaxWidth}
            numInputProps={{ adornment: "px" }}
          />

          <NumRange
            header="Size"
            min={minSize}
            max={maxSize}
            setMin={setMinSize}
            setMax={setMaxSize}
            numInputProps={{ adornment: "kb" }}
          />
        </Card>

        <Card flex={1} width="12rem" spacing="0.5rem">
          <LogOpsInput
            header="Bitrate"
            logOpValue={store.bitrate.logOp}
            numValue={bitrate}
            setLogOpValue={store.setBitrateOp}
            setNumValue={setBitrate}
            numInputProps={{ minValue: 0, adornment: "kb/s" }}
          />

          <LogOpsInput
            header="Duration"
            logOpValue={store.duration.logOp}
            setLogOpValue={store.setDurationOp}
            numValue={store.duration.value}
            numValueDisplay={duration}
            setNumValueDisplay={setDuration}
            numInputProps={{ minValue: 0, adornment: "hms" }}
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
