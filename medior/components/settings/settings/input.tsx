import { observer, useStores } from "medior/store";
import { Input as InputBase, InputProps as InputBaseProps } from "medior/components";
import { ConfigKey } from "medior/utils";

export interface InputProps extends InputBaseProps {
  configKey: ConfigKey;
}

export const Input = observer(({ configKey, ...props }: InputProps) => {
  const stores = useStores();

  const value = stores.home.settings.getConfigByKey<string>(configKey) ?? "";

  const setValue = (val: string) => stores.home.settings.update({ [configKey]: val });

  return <InputBase {...{ setValue, value }} {...props} />;
});
