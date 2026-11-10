import { SORT_OPTIONS } from "medior/store/_generated";
import {
  Card,
  Checkbox,
  Comp,
  DateRange,
  FilterChecklist,
  FilterHeader,
  FilterMenu,
  FilterMenuProps,
  getWatchStatusMeta,
  Input,
  LogOpsInput,
  NumRange,
  TagInput,
  UniformList,
  View,
} from "medior/components";
import { MediaProgramSearch, useStores } from "medior/store";
import { MEDIA_PROGRAM_WATCH_STATUSES } from "medior/utils/common";

/** Every checklist matches the widest, Watch Status. */
const CHECKLIST_WIDTH = "10.5rem";

const WATCH_STATUS_OPTIONS = [...MEDIA_PROGRAM_WATCH_STATUSES];

export interface MediaProgramFilterMenuProps extends Partial<
  Pick<FilterMenuProps, "resetFn" | "searchFn" | "sortOptions">
> {
  store: MediaProgramSearch;
}

/**
 * The options' values missing from a list. The search stores unchecked values as exclusions, like
 * the file filter's columns, so every option starts checked.
 */
const getOtherValues = (options: { value: string }[], values: string[]) =>
  options.map((option) => option.value).filter((value) => !values.includes(value));

const toOptions = (values: string[]) => values.map((value) => ({ label: value, value }));

export const MediaProgramFilterMenu = Comp(
  ({
    resetFn,
    searchFn,
    sortOptions = SORT_OPTIONS.MediaProgram,
    store,
  }: MediaProgramFilterMenuProps) => {
    const stores = useStores();
    const settings = stores.home.settings.mediaPrograms;

    const languageOptions = toOptions(settings.languages);
    const mediumOptions = toOptions(settings.mediums);
    const typeOptions = toOptions(settings.types);
    const watchStatusOptions = WATCH_STATUS_OPTIONS.map(({ label, value }) => ({
      color: getWatchStatusMeta(value, false).bgColor,
      label,
      value,
    }));

    const handleLanguages = (checked: string[]) =>
      store.setExcludedLanguages(getOtherValues(languageOptions, checked));

    const handleMediums = (checked: string[]) =>
      store.setExcludedMediums(getOtherValues(mediumOptions, checked));

    const handleTypes = (checked: string[]) =>
      store.setExcludedTypes(getOtherValues(typeOptions, checked));

    const handleWatchStatuses = (checked: string[]) =>
      store.setExcludedWatchStatuses(getOtherValues(WATCH_STATUS_OPTIONS, checked));

    // Programs being rewatched show unless unticked, like the statuses beside them.
    const toggleIsRewatching = () =>
      store.setIsRewatching(store.isRewatching === false ? null : false);

    return (
      <FilterMenu store={store} resetFn={resetFn} searchFn={searchFn} sortOptions={sortOptions}>
        <View row spacing="0.5rem">
          <Card flex={1} spacing="0.5rem">
            <TagInput
              header="Genres"
              value={store.genres}
              onChange={store.setGenres}
              hasSearchMenu
              width="12rem"
            />

            <TagInput
              header="Tags"
              value={store.tags}
              onChange={store.setTags}
              hasCreate
              hasDelete
              hasEditor
              hasSearchMenu
              width="12rem"
            />
          </Card>

          <Card flex="none" width="22rem" spacing="0.5rem">
            <Input
              header={
                <FilterHeader label="Name" mode={store.nameMode} setMode={store.setNameMode} />
              }
              value={store.name}
              setValue={store.setName}
            />

            <View row spacing="0.5rem">
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
            </View>

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

          <Card width={CHECKLIST_WIDTH} overflow="auto">
            <FilterChecklist
              label="Watch Status"
              options={watchStatusOptions}
              selected={getOtherValues(WATCH_STATUS_OPTIONS, store.excludedWatchStatuses)}
              setSelected={handleWatchStatuses}
            >
              <Checkbox
                label="Rewatching"
                checked={store.isRewatching !== false}
                setChecked={toggleIsRewatching}
                flex="none"
              />
            </FilterChecklist>
          </Card>

          <UniformList column width={CHECKLIST_WIDTH} spacing="0.5rem">
            <Card overflow="auto">
              <FilterChecklist
                label="Type"
                options={typeOptions}
                selected={getOtherValues(typeOptions, store.excludedTypes)}
                setSelected={handleTypes}
              />
            </Card>

            <Card overflow="auto">
              <FilterChecklist
                label="Medium"
                options={mediumOptions}
                selected={getOtherValues(mediumOptions, store.excludedMediums)}
                setSelected={handleMediums}
              />
            </Card>
          </UniformList>

          <Card width={CHECKLIST_WIDTH} overflow="auto">
            <FilterChecklist
              label="Language"
              options={languageOptions}
              selected={getOtherValues(languageOptions, store.excludedLanguages)}
              setSelected={handleLanguages}
            />
          </Card>
        </View>
      </FilterMenu>
    );
  },
);
