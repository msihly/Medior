import { SORT_OPTIONS } from "medior/store/_generated";
import {
  Card,
  Comp,
  DateRange,
  FilterHeader,
  FilterMenu,
  Input,
  LogOpsInput,
  NumRange,
  TagInput,
  UniformList,
  View,
} from "medior/components";
import { FileCollectionSearch } from "medior/store";
import { colors, CssColor } from "medior/utils/client";

export interface CollectionFilterMenuProps {
  color?: CssColor;
  store: FileCollectionSearch;
}

export const CollectionFilterMenu = Comp(
  ({ color = colors.foreground, store }: CollectionFilterMenuProps) => {
    return (
      <FilterMenu
        store={store}
        color={color}
        sortOptions={SORT_OPTIONS.FileCollection}
        viewProps={{ width: "40rem" }}
      >
        <View row spacing="0.5rem">
          <Card flex={1}>
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

          <Card column spacing="0.5rem">
            <Input
              header={
                <FilterHeader label="Title" mode={store.titleMode} setMode={store.setTitleMode} />
              }
              value={store.title}
              setValue={store.setTitle}
            />

            <UniformList row spacing="0.5rem">
              <LogOpsInput
                header={
                  <FilterHeader
                    label="File Count"
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
                <FilterHeader label="Size" mode={store.sizeMode} setMode={store.setSizeMode} />
              }
              min={store._minSize}
              max={store._maxSize}
              setMin={store._setMinSize}
              setMax={store._setMaxSize}
              numInputProps={{ adornment: "kb" }}
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
        </View>
      </FilterMenu>
    );
  },
);
