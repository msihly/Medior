import { observer, useStores } from "medior/store";
import {
  SortMenu as SortMenuBase,
  SortMenuProps as SortMenuBaseProps,
  View,
} from "medior/components";
import { Label } from "./label";
import { colors, ConfigKey } from "medior/utils";

export interface SortMenuProps extends Omit<SortMenuBaseProps, "setValue" | "value"> {
  configKey: ConfigKey;
  label: string;
}

export const SortMenu = observer(({ configKey, label, ...props }: SortMenuProps) => {
  const stores = useStores();

  const value = stores.home.settings.getConfigByKey<SortMenuBaseProps["value"]>(configKey);

  const setValue = (value: SortMenuBaseProps["value"]) =>
    stores.home.settings.update({ [configKey]: value });

  return (
    <View column>
      <Label {...{ label }} />

      <SortMenuBase {...{ setValue, value }} width="9rem" color={colors.background} {...props} />
    </View>
  );
});
