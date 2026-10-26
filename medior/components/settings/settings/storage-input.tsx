import { Comp, IconButton, Input, InputProps, View } from "medior/components";
import { useStores } from "medior/store";
import { colors } from "medior/utils/client";
import { DiskStatus } from "./disk-status";

export interface StorageInputProps extends Omit<InputProps, "setValue" | "value"> {
  index: number;
  selectLocation: () => Promise<string | undefined>;
}

export const StorageInput = Comp(({ index, selectLocation, ...props }: StorageInputProps) => {
  const stores = useStores();
  const store = stores.home.settings;

  const value = store.db.fileStorage.locations[index];

  const decrementIndex = () => store.setFileStorageIndex(index, index - 1);

  const handleLocationClick = async (event: React.MouseEvent) => {
    event.preventDefault();

    const location = await selectLocation();

    if (location) setLocationValue(location);
  };

  const handleDelete = () => store.removeFileStorageLocation(index);

  const incrementIndex = () => store.setFileStorageIndex(index, index + 1);

  const setLocationValue = (val: string) => store.setFileStorageLocation(index, val);

  return (
    <View row align="center" spacing="0.5rem">
      <IconButton name="ArrowUpward" onClick={decrementIndex} disabled={index === 0} />

      <IconButton
        name="ArrowDownward"
        onClick={incrementIndex}
        disabled={index === store.db.fileStorage.locations.length - 1}
      />

      <Input
        value={value}
        setValue={setLocationValue}
        onClick={handleLocationClick}
        flex={1}
        {...props}
      />

      <DiskStatus diskPath={value} threshold={store.db.fileStorage.threshold} />

      <IconButton name="Delete" onClick={handleDelete} iconProps={{ color: colors.custom.red }} />
    </View>
  );
});
