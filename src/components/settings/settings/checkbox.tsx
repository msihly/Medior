import { observer, useStores } from "src/store";
import { Checkbox as CheckboxBase, CheckboxProps as CheckboxBaseProps } from "src/components";
import { ConfigKey } from "src/utils";

export interface CheckboxProps extends Omit<CheckboxBaseProps, "checked" | "setChecked"> {
  checked?: boolean;
  configKey: ConfigKey;
  onChange?: (checked: boolean) => void;
  setChecked?: (checked: boolean) => void;
}

export const Checkbox = observer(({ checked, configKey, onChange, ...props }: CheckboxProps) => {
  const stores = useStores();

  checked = checked ?? stores.home.settings.getConfigByKey<boolean>(configKey);

  const setChecked = (checked: boolean) =>
    onChange ? onChange(checked) : stores.home.settings.update({ [configKey]: checked });

  return <CheckboxBase {...{ checked, setChecked }} flex="inherit" {...props} />;
});
