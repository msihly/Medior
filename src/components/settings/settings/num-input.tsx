import { observer, useStores } from "src/store";
import { NumInput as NumInputBase, NumInputProps as NumInputBaseProps } from "src/components";
import { ConfigKey } from "src/utils";

export interface NumInputProps extends NumInputBaseProps {
  configKey: ConfigKey;
}

export const NumInput = observer(({ configKey, ...props }: NumInputProps) => {
  const stores = useStores();

  const value = stores.home.settings.getConfigByKey<number>(configKey) ?? 0;

  const setValue = (val: number) => stores.home.settings.update({ [configKey]: val });

  return (
    <NumInputBase
      {...{ setValue, value }}
      width="8rem"
      textAlign="center"
      detachLabel
      {...props}
    />
  );
});
