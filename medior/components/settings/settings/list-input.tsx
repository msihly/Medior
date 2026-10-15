import { Comp, MultiInput, MultiInputProps } from "medior/components";
import { useStores } from "medior/store";
import { ConfigKey } from "medior/utils/server";

export interface ListInputProps extends Omit<MultiInputProps, "onChange" | "value"> {
  configKey: ConfigKey;
}

/** Edits a list of names, such as the media program types offered elsewhere. */
export const ListInput = Comp(({ configKey, ...props }: ListInputProps) => {
  const stores = useStores();
  const store = stores.home.settings;

  const value = store.getConfigByKey<string[]>(configKey) ?? [];

  const handleChange = (items: string[]) =>
    store.update({ [configKey]: items.map((item) => item.trim()).filter(Boolean) });

  return <MultiInput {...props} value={[...value]} onChange={handleChange} />;
});
