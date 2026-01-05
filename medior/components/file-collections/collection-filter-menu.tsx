import { SORT_OPTIONS } from "medior/store/_generated";
import {
  Card,
  Comp,
  DateRange,
  FilterMenu,
  Input,
  LogOpsInput,
  TagInput,
  View,
} from "medior/components";
import { FileCollectionSearch } from "medior/store";
import { colors } from "medior/utils/client";

export interface CollectionFilterMenuProps {
  color?: string;
  store: FileCollectionSearch;
}

export const CollectionFilterMenu = Comp(
  ({ color = colors.foreground, store }: CollectionFilterMenuProps) => {
    return (
      <FilterMenu
        store={store}
        color={color}
        sortOptions={SORT_OPTIONS.FileCollection}
        width="10rem"
        viewProps={{ width: "25rem" }}
      >
        <Card>
          <Input header="Title" value={store.title} setValue={store.setTitle} />
        </Card>

        <View row justify="space-between" spacing="0.5rem">
          <Card flex={1}>
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

          <Card column spacing="0.5rem">
            <LogOpsInput
              header="File Count"
              logOpValue={store.fileCount.logOp}
              numValue={store.fileCount.value}
              setLogOpValue={store.setFileCountOp}
              setNumValue={store.setFileCountValue}
              numInputProps={{ minValue: 0 }}
              width="9rem"
            />

            <LogOpsInput
              header="Rating"
              logOpValue={store.rating.logOp}
              numValue={store.rating.value}
              setLogOpValue={store.setRatingOp}
              setNumValue={store.setRatingValue}
              numInputProps={{ maxValue: 9, minValue: 0 }}
              width="9rem"
            />
          </Card>
        </View>

        <Card width="100%" spacing="0.5rem">
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
      </FilterMenu>
    );
  },
);
