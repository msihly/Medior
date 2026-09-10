import {
  Comp,
  Dropdown as DropdownBase,
  DropdownProps as DropdownBaseProps,
} from "medior/components";
import { useStores } from "medior/store";
import { ConfigKey } from "medior/utils/server";

export interface DropdownProps extends Omit<DropdownBaseProps, "setValue" | "value"> {
  configKey: ConfigKey;
  setValue?: DropdownBaseProps["setValue"];
  value?: string;
}

export const Dropdown = Comp(({ configKey, setValue, value, ...props }: DropdownProps) => {
  const stores = useStores();

  const resolvedValue = value ?? stores.home.settings.getConfigByKey<string>(configKey);

  const handleSetValue = (value?: string) => {
    if (value === undefined) return;
    if (setValue) setValue(value);
    else stores.home.settings.update({ [configKey]: value });
  };

  return <DropdownBase {...props} setValue={handleSetValue} value={resolvedValue} />;
});
