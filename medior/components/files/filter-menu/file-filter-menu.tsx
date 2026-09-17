import { SORT_OPTIONS } from "medior/store/_generated";
import {
  Card,
  Checkbox,
  Comp,
  DateRange,
  FileFilter,
  FilterHeader,
  FilterMenu,
  Input,
  LogOpsInput,
  NumRange,
  TagInput,
  View,
} from "medior/components";
import { FileSearch, useStores } from "medior/store";
import { colors, CssColor } from "medior/utils/client";
import { AudioCodec, ImageExt, VideoCodec, VideoExt } from "medior/utils/common";

export interface FileFilterMenuProps {
  color?: CssColor;
  store: FileSearch;
}

export const FileFilterMenu = Comp(({ color = colors.foreground, store }: FileFilterMenuProps) => {
  const stores = useStores();
  const config = stores.home.settings;

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

  const toggleIsTranscribed = () =>
    store.setIsTranscribed(
      store.isTranscribed === true ? false : store.isTranscribed === false ? null : true,
    );

  return (
    <FilterMenu store={store} resetFn={store._reset} color={color} sortOptions={SORT_OPTIONS.File}>
      <View row height="20.5rem" spacing="0.5rem">
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

        <Card height="100%" width="9rem" spacing="0.5rem">
          <LogOpsInput
            header={
              <FilterHeader
                label="# of Tags"
                mode={store.numOfTagsMode}
                setMode={store.setNumOfTagsMode}
              />
            }
            logOpValue={store.numOfTags.logOp}
            numValue={store.numOfTags.value}
            setLogOpValue={store.setNumOfTagsOp}
            setNumValue={store.setNumOfTagsValue}
            numInputProps={{ maxValue: 50, minValue: 0 }}
          />

          <LogOpsInput
            header={
              <FilterHeader label="Rating" mode={store.ratingMode} setMode={store.setRatingMode} />
            }
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

            <Checkbox
              label="Transcribed"
              checked={store.isTranscribed}
              indeterminate={store.isTranscribed === false}
              setChecked={toggleIsTranscribed}
              color={colors.custom.green}
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
        <Card flex="none" width="22rem" spacing="0.5rem">
          <DateRange
            header={
              <FilterHeader
                label="Date Created"
                mode={store.dateCreatedMode}
                setMode={store.setDateCreatedMode}
              />
            }
            startDate={store.dateCreatedStart}
            setStartDate={store.setDateCreatedStart}
            endDate={store.dateCreatedEnd}
            setEndDate={store.setDateCreatedEnd}
          />

          <DateRange
            header={
              <FilterHeader
                label="Date Modified"
                mode={store.dateModifiedMode}
                setMode={store.setDateModifiedMode}
              />
            }
            startDate={store.dateModifiedStart}
            setStartDate={store.setDateModifiedStart}
            endDate={store.dateModifiedEnd}
            setEndDate={store.setDateModifiedEnd}
          />

          <Input
            header={
              <FilterHeader
                label="Original File Path"
                mode={store.originalPathMode}
                setMode={store.setOriginalPathMode}
              />
            }
            value={store.originalPath}
            setValue={store.setOriginalPath}
          />

          <Input
            header={
              <FilterHeader
                label="Transcription"
                mode={store.transcriptionMode}
                setMode={store.setTranscriptionMode}
              />
            }
            value={store.transcription}
            setValue={store.setTranscription}
          />

          <Input
            header={
              <FilterHeader
                label="Diffusion Params"
                mode={store.diffusionParamsMode}
                setMode={store.setDiffusionParamsMode}
              />
            }
            value={store.diffusionParams}
            setValue={store.setDiffusionParams}
          />
        </Card>

        <Card flex={1} width="12rem" spacing="0.5rem">
          <NumRange
            header={
              <FilterHeader
                label="Long Edge"
                mode={store.longEdgeMode}
                setMode={store.setLongEdgeMode}
              />
            }
            min={store.minLongEdge}
            max={store.maxLongEdge}
            setMin={store.setMinLongEdge}
            setMax={store.setMaxLongEdge}
            numInputProps={{ adornment: "px" }}
          />

          <NumRange
            header={
              <FilterHeader
                label="Short Edge"
                mode={store.shortEdgeMode}
                setMode={store.setShortEdgeMode}
              />
            }
            min={store.minShortEdge}
            max={store.maxShortEdge}
            setMin={store.setMinShortEdge}
            setMax={store.setMaxShortEdge}
            numInputProps={{ adornment: "px" }}
          />

          <NumRange
            header={
              <FilterHeader label="Height" mode={store.heightMode} setMode={store.setHeightMode} />
            }
            min={store.minHeight}
            max={store.maxHeight}
            setMin={store.setMinHeight}
            setMax={store.setMaxHeight}
            numInputProps={{ adornment: "px" }}
          />

          <NumRange
            header={
              <FilterHeader label="Width" mode={store.widthMode} setMode={store.setWidthMode} />
            }
            min={store.minWidth}
            max={store.maxWidth}
            setMin={store.setMinWidth}
            setMax={store.setMaxWidth}
            numInputProps={{ adornment: "px" }}
          />

          <NumRange
            header={<FilterHeader label="Size" mode={store.sizeMode} setMode={store.setSizeMode} />}
            min={store._minSize}
            max={store._maxSize}
            setMin={store._setMinSize}
            setMax={store._setMaxSize}
            numInputProps={{ adornment: "KB" }}
          />
        </Card>

        <Card flex={1} width="11rem" spacing="0.5rem">
          <LogOpsInput
            header={
              <FilterHeader
                label="Bitrate"
                mode={store.bitrateMode}
                setMode={store.setBitrateMode}
              />
            }
            logOpValue={store.bitrate.logOp}
            numValue={store._bitrate}
            setLogOpValue={store.setBitrateOp}
            setNumValue={store._setBitrate}
            numInputProps={{ minValue: 0, adornment: "kb/s" }}
          />

          <LogOpsInput
            header={
              <FilterHeader
                label="Duration"
                mode={store.durationMode}
                setMode={store.setDurationMode}
              />
            }
            logOpValue={store.duration.logOp}
            setLogOpValue={store.setDurationOp}
            numValue={store.duration.value}
            numValueDisplay={store._duration}
            setNumValueDisplay={store._setDuration}
            numInputProps={{ minValue: 0, adornment: "hms" }}
          />

          <LogOpsInput
            header={
              <FilterHeader
                label="FPS"
                mode={store.frameRateMode}
                setMode={store.setFrameRateMode}
              />
            }
            logOpValue={store.frameRate.logOp}
            numValue={store.frameRate.value}
            setLogOpValue={store.setFrameRateOp}
            setNumValue={store.setFrameRateValue}
            numInputProps={{ minValue: 0 }}
          />

          <LogOpsInput
            header={
              <FilterHeader
                label="# of Collections"
                mode={store.numOfCollectionsMode}
                setMode={store.setNumOfCollectionsMode}
              />
            }
            logOpValue={store.numOfCollections.logOp}
            numValue={store.numOfCollections.value}
            setLogOpValue={store.setNumOfCollectionsOp}
            setNumValue={store.setNumOfCollectionsValue}
            numInputProps={{ minValue: 0 }}
          />
        </Card>
      </View>
    </FilterMenu>
  );
});
