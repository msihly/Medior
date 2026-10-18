import { Button, Comp, View } from "medior/components";
import { useStores } from "medior/store";
import { colors } from "medior/utils/client";
import { StorageInput, StorageInputProps } from "./storage-input";

export const StorageInputs = Comp(
  ({ selectLocation }: Pick<StorageInputProps, "selectLocation">) => {
    const stores = useStores();
    const store = stores.home.settings;

    const handleAdd = async () => {
      const location = await selectLocation();

      if (location) store.addFileStorageLocation(location);
    };

    return (
      <View column flex={1} minWidth={0} spacing="0.5rem">
        {store.db.fileStorage.locations.map((_, index) => (
          <StorageInput
            {...{ index, selectLocation }}
            key={index}
            configKey="db.fileStorage.locations"
          />
        ))}

        <View row>
          <Button
            text="Add Storage"
            icon="Add"
            onClick={handleAdd}
            colorOnHover={colors.custom.blue}
          />
        </View>
      </View>
    );
  },
);
