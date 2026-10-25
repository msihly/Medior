import { SORT_OPTIONS } from "medior/store/_generated";
import {
  Card,
  Checkbox,
  Comp,
  DateRange,
  FilterChecklist,
  FilterHeader,
  FilterMenu,
  Input,
  LogOpsInput,
  NumRange,
  TagInput,
  UniformList,
  View,
} from "medior/components";
import { MediaProgramSearch, useStores } from "medior/store";
import { colors, CssColor } from "medior/utils/client";
import { cycleTriState, MEDIA_PROGRAM_WATCH_STATUSES } from "medior/utils/common";

export interface MediaProgramFilterMenuProps {
  color?: CssColor;
  store: MediaProgramSearch;
}

export const MediaProgramFilterMenu = Comp(
  ({ color = colors.foreground, store }: MediaProgramFilterMenuProps) => {
    const stores = useStores();
    const settings = stores.home.settings.mediaPrograms;

    const toggleIsRewatching = () => store.setIsRewatching(cycleTriState(store.isRewatching));

    return (
      <FilterMenu
        store={store}
        color={color}
        sortOptions={SORT_OPTIONS.MediaProgram}
        viewProps={{ width: "52rem" }}
      >
        <View row spacing="0.5rem">
          <Card flex={1} spacing="0.5rem">
            <TagInput
              header="Genres"
              value={store.genres}
              onChange={store.setGenres}
              hasSearchMenu
              width="13rem"
            />

            <TagInput
              header="Tags"
              value={store.tags}
              onChange={store.setTags}
              hasCreate
              hasDelete
              hasEditor
              hasSearchMenu
              width="13rem"
            />
          </Card>

          <Card spacing="0.5rem">
            <Input
              header={
                <FilterHeader label="Name" mode={store.nameMode} setMode={store.setNameMode} />
              }
              value={store.name}
              setValue={store.setName}
            />

            <UniformList row spacing="0.5rem">
              <LogOpsInput
                header={
                  <FilterHeader
                    label="Episodes"
                    mode={store.fileCountMode}
                    setMode={store.setFileCountMode}
                  />
                }
                logOpValue={store.fileCount.logOp}
                numValue={store.fileCount.value}
                setLogOpValue={store.setFileCountOp}
                setNumValue={store.setFileCountValue}
                numInputProps={{ minValue: 0 }}
              />

              <LogOpsInput
                header={
                  <FilterHeader
                    label="Rating"
                    mode={store.ratingMode}
                    setMode={store.setRatingMode}
                  />
                }
                logOpValue={store.rating.logOp}
                numValue={store.rating.value}
                setLogOpValue={store.setRatingOp}
                setNumValue={store.setRatingValue}
                numInputProps={{ maxValue: 9, minValue: 0 }}
              />
            </UniformList>

            <NumRange
              header={
                <FilterHeader label="Year" mode={store.yearMode} setMode={store.setYearMode} />
              }
              min={store.minYear}
              max={store.maxYear}
              setMin={store.setMinYear}
              setMax={store.setMaxYear}
            />

            <DateRange
              header={
                <FilterHeader
                  label="Date Last Watched"
                  mode={store.dateLastWatchedMode}
                  setMode={store.setDateLastWatchedMode}
                />
              }
              startDate={store.dateLastWatchedStart}
              setStartDate={store.setDateLastWatchedStart}
              endDate={store.dateLastWatchedEnd}
              setEndDate={store.setDateLastWatchedEnd}
            />

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
          </Card>

          <Card spacing="0.5rem" overflow="hidden auto">
            <FilterChecklist
              label="Watch Status"
              options={[...MEDIA_PROGRAM_WATCH_STATUSES]}
              selected={store.watchStatuses}
              setSelected={store.setWatchStatuses}
            />

            <Checkbox
              label="Rewatching"
              checked={store.isRewatching === true}
              indeterminate={store.isRewatching === false}
              setChecked={toggleIsRewatching}
              flex="none"
            />

            <FilterChecklist
              label="Type"
              options={settings.types.map((value) => ({ label: value, value }))}
              selected={store.types}
              setSelected={store.setTypes}
            />

            <FilterChecklist
              label="Medium"
              options={settings.mediums.map((value) => ({ label: value, value }))}
              selected={store.mediums}
              setSelected={store.setMediums}
            />

            <FilterChecklist
              label="Language"
              options={settings.languages.map((value) => ({ label: value, value }))}
              selected={store.languages}
              setSelected={store.setLanguages}
            />
          </Card>
        </View>
      </FilterMenu>
    );
  },
);
