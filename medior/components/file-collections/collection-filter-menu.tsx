import { FileCollectionSearch, SORT_OPTIONS, TagOption, observer } from "medior/store";
import { Card, DateRange, FilterMenu, Input, LogOpsInput, TagInput, View } from "medior/components";
import { colors, LogicalOp, useDeepMemo } from "medior/utils";

export interface CollectionFilterMenuProps {
  color?: string;
  store: FileCollectionSearch;
}

export const CollectionFilterMenu = observer(
  ({ color = colors.foreground, store }: CollectionFilterMenuProps) => {
    const tags = useDeepMemo(store.tags);

    const setDateCreatedEnd = (val: string) => store.setDateCreatedEnd(val);

    const setDateCreatedStart = (val: string) => store.setDateCreatedStart(val);

    const setDateModifiedEnd = (val: string) => store.setDateModifiedEnd(val);

    const setDateModifiedStart = (val: string) => store.setDateModifiedStart(val);

    const setFileCountOp = (val: LogicalOp) => store.setFileCountOp(val);

    const setFileCountValue = (val: number) => store.setFileCountValue(val);

    const setRatingOp = (val: LogicalOp) => store.setRatingOp(val);

    const setRatingValue = (val: number) => store.setRatingValue(val);

    const setTags = (val: TagOption[]) => store.setTags(val);

    const setTitle = (val: string) => store.setTitle(val);

    return (
      <FilterMenu
        store={store}
        color={color}
        sortOptions={SORT_OPTIONS.FileCollection}
        width="10rem"
      >
        <Card>
          <Input header="Title" value={store.title} setValue={setTitle} />
        </Card>

        <View row justify="space-between" spacing="0.5rem">
          <Card flex={1}>
            <TagInput
              header="Tags"
              value={tags}
              onChange={setTags}
              hasCreate
              hasDelete
              hasEditor
              hasSearchMenu
            />
          </Card>

          <Card spacing="0.5rem">
            <LogOpsInput
              header="File Count"
              logOpValue={store.fileCountOp}
              numValue={store.fileCountValue}
              setLogOpValue={setFileCountOp}
              setNumValue={setFileCountValue}
              numInputProps={{ minValue: 0, width: "4rem" }}
            />

            <LogOpsInput
              header="Rating"
              logOpValue={store.ratingOp}
              numValue={store.ratingValue}
              setLogOpValue={setRatingOp}
              setNumValue={setRatingValue}
              numInputProps={{ maxValue: 9, minValue: 0, width: "4rem" }}
            />
          </Card>
        </View>

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
      </FilterMenu>
    );
  }
);
