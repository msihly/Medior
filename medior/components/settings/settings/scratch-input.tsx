import { Comp, IconButton, Text, View } from "medior/components";
import { useStores } from "medior/store";
import { colors } from "medior/utils/client";
import { DiskStatus } from "./disk-status";
import { Input } from "./input";
import { StorageInputProps } from "./storage-input";

export const ScratchInput = Comp(
  ({ selectLocation }: Pick<StorageInputProps, "selectLocation">) => {
    const stores = useStores();
    const store = stores.home.settings;

    const value = store.db.fileStorage.scratchPath;

    const handleClear = () => store.setScratchPath("");

    const handleLocationClick = async (event: React.MouseEvent) => {
      event.preventDefault();

      const location = await selectLocation();

      if (location) store.setScratchPath(location);
    };

    return (
      <View row flex={1} align="center" minWidth={0} spacing="0.5rem">
        <Input configKey="db.fileStorage.scratchPath" onClick={handleLocationClick} flex={1} />

        {value ? (
          <DiskStatus diskPath={value} />
        ) : (
          <View row align="center" width="17rem">
            <Text color={colors.custom.grey}>{"Uses the storage locations"}</Text>
          </View>
        )}

        <IconButton
          name="Close"
          onClick={handleClear}
          disabled={!value}
          tooltip="Use the storage locations"
        />
      </View>
    );
  },
);
