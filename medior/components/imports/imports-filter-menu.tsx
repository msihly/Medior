import { SORT_OPTIONS } from "medior/store/_generated";
import {
  Card,
  Checkbox,
  Comp,
  DateRange,
  FilterChecklist,
  FilterHeader,
  FilterMenu,
  IMPORT_STATUSES,
  Input,
  LogOpsInput,
  TagInput,
  View,
} from "medior/components";
import { FileImportBatchSearch } from "medior/store";
import { colors, CssColor } from "medior/utils/client";

export interface ImportsFilterMenuProps {
  color?: CssColor;
  store: FileImportBatchSearch;
}

export const ImportsFilterMenu = Comp(
  ({ color = colors.foreground, store }: ImportsFilterMenuProps) => {
    const statusOptions = Object.entries(IMPORT_STATUSES).map(([value, { label }]) => ({
      label,
      value,
    }));

    return (
      <FilterMenu store={store} color={color} sortOptions={SORT_OPTIONS.FileImportBatch}>
        <View row spacing="0.5rem">
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
            <Card width="20rem" spacing="0.5rem">
              <Checkbox
                label="Completed"
                checked={store.isCompleted}
                setChecked={store.setIsCompleted}
                color={colors.custom.green}
                flex="none"
              />

              <Input
                header={
                  <FilterHeader
                    label="File Path"
                    mode={store.filePathMode}
                    setMode={store.setFilePathMode}
                  />
                }
                value={store.filePath}
                setValue={store.setFilePath}
              />

              <Input
                header={
                  <FilterHeader
                    label="Collection Title"
                    mode={store.collectionTitleMode}
                    setMode={store.setCollectionTitleMode}
                  />
                }
                value={store.collectionTitle}
                setValue={store.setCollectionTitle}
              />

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
                    label="Date Imported"
                    mode={store.startedAtMode}
                    setMode={store.setStartedAtMode}
                  />
                }
                startDate={store.startedAtStart}
                setStartDate={store.setStartedAtStart}
                endDate={store.startedAtEnd}
                setEndDate={store.setStartedAtEnd}
              />

              <DateRange
                header={
                  <FilterHeader
                    label="Date Completed"
                    mode={store.completedAtMode}
                    setMode={store.setCompletedAtMode}
                  />
                }
                startDate={store.completedAtStart}
                setStartDate={store.setCompletedAtStart}
                endDate={store.completedAtEnd}
                setEndDate={store.setCompletedAtEnd}
              />
            </Card>
          </View>

          <Card>
            <FilterChecklist
              label="Has Files With Status"
              options={statusOptions}
              selected={store.statuses}
              setSelected={store.setStatuses}
            />
          </Card>
        </View>
      </FilterMenu>
    );
  },
);
