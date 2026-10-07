import {
  Comp,
  NumInput as NumInputBase,
  NumInputProps as NumInputBaseProps,
} from "medior/components";
import { useStores } from "medior/store";
import { ConfigKey } from "medior/utils/server";

export interface NumInputProps extends NumInputBaseProps {
  configKey: ConfigKey;
}

export const NumInput = Comp(({ configKey, ...props }: NumInputProps) => {
  const stores = useStores();
  const store = stores.home.settings;

  const value = store.getConfigByKey<number>(configKey) ?? 0;

  const setValue = (val: number) => store.update({ [configKey]: val });

  return <NumInputBase {...{ setValue, value }} width="8rem" textAlign="center" {...props} />;
});
