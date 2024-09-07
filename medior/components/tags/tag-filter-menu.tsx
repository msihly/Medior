import { SORT_OPTIONS, TagOption, TagSearch, observer } from "medior/store";
import {
  Card,
  Checkbox,
  DateRange,
  FilterMenu,
  Input,
  LogOpsInput,
  TagInput,
  View,
} from "medior/components";
import { colors, LogicalOp } from "medior/utils";

export interface TagFilterMenuProps {
  color?: string;
  store: TagSearch;
}

export const TagFilterMenu = observer(
  ({ color = colors.foreground, store }: TagFilterMenuProps) => {
    const setAlias = (val: string) => store.setAlias(val);

    const setCountOp = (val: LogicalOp | "") => store.setCountOp(val);

    const setCountValue = (val: number) => store.setCountValue(val);

    const setDateCreatedEnd = (val: string) => store.setDateCreatedEnd(val);

    const setDateCreatedStart = (val: string) => store.setDateCreatedStart(val);

    const setDateModifiedEnd = (val: string) => store.setDateModifiedEnd(val);

    const setDateModifiedStart = (val: string) => store.setDateModifiedStart(val);

    const setLabel = (val: string) => store.setLabel(val);

    const setTags = (val: TagOption[]) => store.setTags(val);

    return (
      <FilterMenu store={store} color={color} sortOptions={SORT_OPTIONS.Tag} width="10rem">
        <Card row spacing="0.5rem">
          <View column width="100%">
            <TagInput
              header="Tags"
              value={store.tags}
              onChange={setTags}
              hasCreate
              hasDelete
              hasEditor
              hasSearchMenu
            />
          </View>

          <View column width="100%" spacing="0.5rem">
            <Input header="Label" value={store.label} setValue={setLabel} />

            <Input header="Alias" value={store.alias} setValue={setAlias} />
          </View>
        </Card>

        <View row spacing="0.5rem">
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

          <Card column flex={1} spacing="0.5rem">
            <LogOpsInput
              header="Tag File Count"
              logOpValue={store.count.logOp}
              setLogOpValue={setCountOp}
              numValue={store.count.value}
              setNumValue={setCountValue}
            />

            <Checkbox
              label="Has RegEx"
              checked={store.regExMode === "hasRegEx"}
              indeterminate={store.regExMode === "hasNoRegEx"}
              setChecked={store.toggleRegExMode}
            />
          </Card>
        </View>
      </FilterMenu>
    );
  }
);
