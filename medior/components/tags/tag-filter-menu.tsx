import { SORT_OPTIONS } from "medior/store/_generated";
import {
  Card,
  Checkbox,
  Comp,
  DateRange,
  FilterMenu,
  Input,
  LogOpsInput,
  TagInput,
  View,
} from "medior/components";
import { TagSearch } from "medior/store";
import { colors } from "medior/utils/client";

export interface TagFilterMenuProps {
  color?: string;
  store: TagSearch;
}

export const TagFilterMenu = Comp(({ color = colors.foreground, store }: TagFilterMenuProps) => {
  return (
    <FilterMenu store={store} color={color} sortOptions={SORT_OPTIONS.Tag} width="10rem">
      <Card row spacing="0.5rem">
        <View column width="100%">
          <TagInput
            header="Tags"
            value={store.tags}
            onChange={store.setTags}
            hasCreate
            hasDelete
            hasEditor
            hasSearchMenu
          />
        </View>

        <View column width="100%" spacing="0.5rem">
          <Input header="Label" value={store.label} setValue={store.setLabel} />

          <Input header="Alias" value={store.alias} setValue={store.setAlias} />
        </View>
      </Card>

      <View row spacing="0.5rem">
        <Card width="20rem" spacing="0.5rem">
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

        <Card column flex={1} spacing="0.5rem">
          <LogOpsInput
            header="Tag File Count"
            logOpValue={store.count.logOp}
            setLogOpValue={store.setCountOp}
            numValue={store.count.value}
            setNumValue={store.setCountValue}
          />

          <Checkbox
            label="Has RegEx"
            checked={store.hasRegEx}
            indeterminate={store.hasRegEx === false}
            setChecked={store.toggleHasRegEx}
          />
        </Card>
      </View>
    </FilterMenu>
  );
});
