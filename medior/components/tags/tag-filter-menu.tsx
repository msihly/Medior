import { SORT_OPTIONS } from "medior/store/_generated";
import {
  Card,
  Checkbox,
  Comp,
  DateRange,
  FilterHeader,
  FilterMenu,
  Input,
  LogOpsInput,
  TagInput,
  View,
} from "medior/components";
import { TagSearch } from "medior/store";
import { colors, CssColor } from "medior/utils/client";

export interface TagFilterMenuProps {
  color?: CssColor;
  store: TagSearch;
}

export const TagFilterMenu = Comp(({ color = colors.foreground, store }: TagFilterMenuProps) => {
  return (
    <FilterMenu store={store} color={color} sortOptions={SORT_OPTIONS.Tag}>
      <View row spacing="0.5rem" width="100%">
        <Card column flex={1} spacing="0.5rem">
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

          <Checkbox
            label="Has RegEx"
            checked={store.hasRegEx}
            indeterminate={store.hasRegEx === false}
            setChecked={store.toggleHasRegEx}
            flex={0}
          />
        </Card>

        <Card column width="20rem" spacing="0.5rem">
          <Input
            header={
              <FilterHeader label="Label" mode={store.labelMode} setMode={store.setLabelMode} />
            }
            value={store.label}
            setValue={store.setLabel}
          />

          <Input
            header={
              <FilterHeader label="Alias" mode={store.aliasMode} setMode={store.setAliasMode} />
            }
            value={store.alias}
            setValue={store.setAlias}
          />

          <View row spacing="0.5rem">
            <LogOpsInput
              header={
                <FilterHeader
                  label="File Count"
                  mode={store.countMode}
                  setMode={store.setCountMode}
                />
              }
              logOpValue={store.count.logOp}
              setLogOpValue={store.setCountOp}
              numValue={store.count.value}
              setNumValue={store.setCountValue}
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

          <DateRange
            header={
              <FilterHeader
                label="Date of Inception"
                mode={store.dateOfInceptionMode}
                setMode={store.setDateOfInceptionMode}
              />
            }
            startDate={store.dateOfInceptionStart}
            setStartDate={store.setDateOfInceptionStart}
            endDate={store.dateOfInceptionEnd}
            setEndDate={store.setDateOfInceptionEnd}
          />
        </Card>
      </View>
    </FilterMenu>
  );
});
