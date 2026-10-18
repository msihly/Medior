import { Comp, MultiInput, MultiInputProps, Text, View } from "medior/components";
import { useStores } from "medior/store";
import { ConfigKey } from "medior/utils/server";

export interface ListInputProps extends Omit<MultiInputProps, "onChange" | "value"> {
  configKey: ConfigKey;
  label: string;
}

/** Edits a list of names, such as the media program types offered elsewhere. */
export const ListInput = Comp(({ configKey, label, ...props }: ListInputProps) => {
  const stores = useStores();
  const store = stores.home.settings;

  const value = store.getConfigByKey<string[]>(configKey) ?? [];

  const handleChange = (items: string[]) =>
    store.update({ [configKey]: items.map((item) => item.trim()).filter(Boolean) });

  return (
    <View column height="100%" minWidth={0} spacing="0.3rem">
      <Text>{label}</Text>

      <View column flex={1} minHeight={0}>
        <MultiInput {...props} value={[...value]} onChange={handleChange} />
      </View>
    </View>
  );
});
