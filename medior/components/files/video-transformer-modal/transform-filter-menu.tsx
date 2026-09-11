import { SORT_OPTIONS } from "medior/store/_generated";
import {
  Card,
  Checkbox,
  Comp,
  DateRange,
  Dropdown,
  FilterMenu,
  Input,
  View,
} from "medior/components";
import { useStores } from "medior/store";
import { colors } from "medior/utils/client";

export const TransformFilterMenu = Comp(() => {
  const stores = useStores();
  const store = stores.file.videoTransformer.search;

  return (
    <FilterMenu store={store} color={colors.foreground} sortOptions={SORT_OPTIONS.FileTransform}>
      <View row height="18rem" spacing="0.5rem">
        <Card column width="20rem" spacing="0.5rem">
          <Input header="Path" value={store.beforePath} setValue={store.setBeforePath} />

          <Dropdown
            header="Type"
            options={[
              { label: "Any", value: "" },
              { label: "Re-encode", value: "reencode" },
              { label: "Remux", value: "remux" },
              { label: "Splice", value: "splice" },
            ]}
            value={store.type ?? ""}
            setValue={store.setType}
          />

          <Dropdown
            header="Status"
            options={[
              { label: "Any", value: "" },
              { label: "Complete", value: "COMPLETE" },
              { label: "Compressed", value: "COMPRESSED" },
              { label: "Error", value: "ERROR" },
              { label: "Pending", value: "PENDING" },
              { label: "Replaced", value: "REPLACED" },
              { label: "Running", value: "RUNNING" },
              { label: "Saved", value: "SAVED" },
              { label: "Skipped", value: "SKIPPED" },
            ]}
            value={store.status ?? ""}
            setValue={store.setStatus}
          />
        </Card>

        <Card column width="20rem" spacing="0.5rem">
          <Checkbox
            label="Completed"
            checked={store.isCompleted}
            setChecked={store.setIsCompleted}
            color={colors.custom.green}
            flex="none"
          />

          <DateRange
            header="Date Created"
            startDate={store.dateCreatedStart}
            setStartDate={store.setDateCreatedStart}
            endDate={store.dateCreatedEnd}
            setEndDate={store.setDateCreatedEnd}
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
    </FilterMenu>
  );
});
