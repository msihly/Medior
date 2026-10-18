import {
  Comp,
  SortMenu as SortMenuBase,
  SortMenuProps as SortMenuBaseProps,
} from "medior/components";
import { useStores } from "medior/store";
import { colors } from "medior/utils/client";
import { FORM_ROW_HEIGHT } from "medior/utils/common";
import { ConfigKey } from "medior/utils/server";

export interface SortMenuProps extends Omit<SortMenuBaseProps, "setValue" | "value"> {
  configKey: ConfigKey;
}

export const SortMenu = Comp(({ configKey, width = "10rem", ...props }: SortMenuProps) => {
  const stores = useStores();
  const store = stores.home.settings;

  const value = store.getConfigByKey<SortMenuBaseProps["value"]>(configKey);

  const setValue = (value: SortMenuBaseProps["value"]) => store.update({ [configKey]: value });

  return (
    <SortMenuBase
      {...{ setValue, value, width }}
      color={colors.background}
      height={FORM_ROW_HEIGHT}
      {...props}
    />
  );
});
