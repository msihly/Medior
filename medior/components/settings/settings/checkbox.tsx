import {
  Checkbox as CheckboxBase,
  CheckboxProps as CheckboxBaseProps,
  Comp,
} from "medior/components";
import { useStores } from "medior/store";
import { ConfigKey } from "medior/utils/client";

export interface CheckboxProps extends Omit<CheckboxBaseProps, "checked" | "setChecked"> {
  checked?: boolean;
  configKey: ConfigKey;
  onChange?: (checked: boolean) => void;
  setChecked?: (checked: boolean) => void;
}

export const Checkbox = Comp(({ checked, configKey, onChange, ...props }: CheckboxProps) => {
  const stores = useStores();

  checked = checked ?? stores.home.settings.getConfigByKey<boolean>(configKey);

  const setChecked = (checked: boolean) =>
    onChange ? onChange(checked) : stores.home.settings.update({ [configKey]: checked });

  return <CheckboxBase {...{ checked, setChecked }} flex="inherit" {...props} />;
});
