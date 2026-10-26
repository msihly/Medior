import {
  Checkbox as CheckboxBase,
  CheckboxProps as CheckboxBaseProps,
  Comp,
} from "medior/components";
import { useStores } from "medior/store";
import { ConfigKey } from "medior/utils/server";

export interface CheckboxProps extends Omit<CheckboxBaseProps, "checked" | "setChecked"> {
  checked?: boolean;
  configKey: ConfigKey;
  setChecked?: (checked: boolean) => void;
}

export const Checkbox = Comp(({ checked, configKey, setChecked, ...props }: CheckboxProps) => {
  const stores = useStores();

  checked = checked ?? stores.home.settings.getConfigByKey<boolean>(configKey);

  const update = (checked: boolean) => stores.home.settings.update({ [configKey]: checked });

  return (
    <CheckboxBase checked={checked} setChecked={setChecked ?? update} flex="inherit" {...props} />
  );
});
