import { Comp, Input as InputBase, InputProps as InputBaseProps } from "medior/components";
import { useStores } from "medior/store";
import { ConfigKey } from "medior/utils/server";

export interface InputProps extends InputBaseProps {
  configKey: ConfigKey;
}

export const Input = Comp(({ configKey, ...props }: InputProps) => {
  const stores = useStores();
  const store = stores.home.settings;

  const value = store.getConfigByKey<string>(configKey) ?? "";

  const setValue = (val: string) => store.update({ [configKey]: val });

  return <InputBase {...{ setValue, value }} {...props} />;
});
