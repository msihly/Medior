import {
  Card,
  Checkbox,
  Comp,
  DateRange,
  FilterMenu,
  Input,
  TagInput,
  View,
} from "medior/components";
import { FileImportBatchSearch, SORT_OPTIONS } from "medior/store";
import { colors } from "medior/utils/client";

export interface ImportsFilterMenuProps {
  color?: string;
  store: FileImportBatchSearch;
}

export const ImportsFilterMenu = Comp(
  ({ color = colors.foreground, store }: ImportsFilterMenuProps) => {
    return (
      <FilterMenu
        store={store}
        color={color}
        sortOptions={SORT_OPTIONS.FileImportBatch}
        width="10rem"
      >
        <View row height="20rem" spacing="0.5rem">
          <Card>
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

          <View column>
            <Card column width="20rem" spacing="0.5rem">
              <Checkbox
                label="Completed"
                checked={store.isCompleted}
                setChecked={store.setIsCompleted}
                color={colors.custom.green}
                flex="none"
              />

              <Input
                header="Collection Title"
                value={store.collectionTitle}
                setValue={store.setCollectionTitle}
              />

              <DateRange
                header="Date Created"
                startDate={store.dateCreatedStart}
                setStartDate={store.setDateCreatedStart}
                endDate={store.dateCreatedEnd}
                setEndDate={store.setDateCreatedEnd}
              />

              <DateRange
                header="Date Started"
                startDate={store.startedAtStart}
                setStartDate={store.setStartedAtStart}
                endDate={store.startedAtEnd}
                setEndDate={store.setStartedAtEnd}
              />

              <DateRange
                header="Date Completed"
                startDate={store.completedAtStart}
                setStartDate={store.setCompletedAtStart}
                endDate={store.completedAtEnd}
                setEndDate={store.setCompletedAtEnd}
              />
            </Card>
          </View>
        </View>
      </FilterMenu>
    );
  },
);
