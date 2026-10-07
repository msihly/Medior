import { Card, Comp } from "medior/components";
import { useStores } from "medior/store";
import { colors } from "medior/utils/client";
import { StorageInput, StorageInputProps } from "./storage-input";

export const StorageInputs = Comp(
  ({ selectLocation }: Pick<StorageInputProps, "selectLocation">) => {
    const stores = useStores();
    const store = stores.home.settings;

    return (
      <Card
        header="File Storage Locations"
        column
        spacing="0.5rem"
        padding={{ all: "0.5rem" }}
        bgColor={colors.foregroundCard}
      >
        {store.db.fileStorage.locations.map((_, index) => (
          <StorageInput
            {...{ index, selectLocation }}
            key={index}
            configKey="db.fileStorage.locations"
          />
        ))}
      </Card>
    );
  },
);
