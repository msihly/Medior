import { observer, useStores } from "store";
import { Checkbox, CheckboxProps } from "components";
import { ConfigKey } from "utils";

export interface ExtCheckboxProps extends Omit<CheckboxProps, "checked" | "label" | "setChecked"> {
  configKey: ConfigKey;
  ext: string;
}

export const ExtCheckbox = observer(({ configKey, ext, ...props }: ExtCheckboxProps) => {
  const stores = useStores();

  const extTypes = stores.home.settings.getConfigByKey<string[]>(configKey) ?? [];

  const handleChange = (checked: boolean) =>
    stores.home.settings.update({
      [configKey]: checked ? [...extTypes, ext] : extTypes.filter((type) => type !== ext),
    });

  return (
    <Checkbox
      label={ext}
      checked={extTypes?.includes(ext)}
      setChecked={handleChange}
      flex="inherit"
      fullWidth={false}
      {...props}
    />
  );
});
