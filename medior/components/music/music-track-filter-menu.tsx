import { SORT_OPTIONS } from "medior/store/_generated";
import {
  Card,
  Comp,
  DateRange,
  FilterHeader,
  FilterMenu,
  Input,
  LogOpsInput,
  TagInput,
  View,
} from "medior/components";
import { MusicTrackSearch } from "medior/store";

export interface MusicTrackFilterMenuProps {
  store: MusicTrackSearch;
}

/** Filters the library's tracks by their tags, rating, length, path, and import date. */
export const MusicTrackFilterMenu = Comp(({ store }: MusicTrackFilterMenuProps) => (
  <FilterMenu store={store} resetFn={store._reset} sortOptions={SORT_OPTIONS.MusicTrack}>
    <View row spacing="0.5rem">
      <Card flex={1}>
        <TagInput
          header="Tags"
          value={store.tags}
          onChange={store.setTags}
          width="18rem"
          hasCreate
          hasDelete
          hasEditor
          hasSearchMenu
        />
      </Card>

      <Card flex="none" width="22rem" spacing="0.5rem">
        <View row spacing="0.5rem">
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
            numInputProps={{ adornment: "hms", minValue: 0 }}
          />
        </View>

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

        <DateRange
          header={
            <FilterHeader
              label="Date Imported"
              mode={store.dateImportedMode}
              setMode={store.setDateImportedMode}
            />
          }
          startDate={store.dateImportedStart}
          setStartDate={store.setDateImportedStart}
          endDate={store.dateImportedEnd}
          setEndDate={store.setDateImportedEnd}
        />
      </Card>
    </View>
  </FilterMenu>
));
