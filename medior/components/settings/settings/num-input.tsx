import { NumInput as NumInputBase, NumInputProps as NumInputBaseProps } from "medior/components";
import { observer, useStores } from "medior/store";
import { ConfigKey } from "medior/utils/client";

export interface NumInputProps extends NumInputBaseProps {
  configKey: ConfigKey;
}

export const NumInput = observer(({ configKey, ...props }: NumInputProps) => {
  const stores = useStores();

  const value = stores.home.settings.getConfigByKey<number>(configKey) ?? 0;

  const setValue = (val: number) => stores.home.settings.update({ [configKey]: val });

  return <NumInputBase {...{ setValue, value }} width="8rem" textAlign="center" {...props} />;
});
