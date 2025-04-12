import { Checkbox, CheckboxProps, Comp } from "medior/components";
import { useStores } from "medior/store";
import { ConfigKey } from "medior/utils/client";

export interface ExtCheckboxProps extends Omit<CheckboxProps, "checked" | "label" | "setChecked"> {
  configKey: ConfigKey;
  ext: string;
}

export const ExtCheckbox = Comp(({ configKey, ext, ...props }: ExtCheckboxProps) => {
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
