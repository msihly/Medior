import {
  Comp,
  HeaderWrapper,
  HeaderWrapperProps,
  SortMenu as SortMenuBase,
  SortMenuProps as SortMenuBaseProps,
} from "medior/components";
import { useStores } from "medior/store";
import { colors } from "medior/utils/client";
import { ConfigKey } from "medior/utils/server";

export interface SortMenuProps extends Omit<SortMenuBaseProps, "setValue" | "value"> {
  configKey: ConfigKey;
  header: HeaderWrapperProps["header"];
}

export const SortMenu = Comp(({ configKey, header, width = "10rem", ...props }: SortMenuProps) => {
  const stores = useStores();
  const store = stores.home.settings;

  const value = store.getConfigByKey<SortMenuBaseProps["value"]>(configKey);

  const setValue = (value: SortMenuBaseProps["value"]) => store.update({ [configKey]: value });

  return (
    <HeaderWrapper {...{ header, width }} height="100%">
      <SortMenuBase
        {...{ setValue, value, width }}
        color={colors.background}
        hasHeader
        {...props}
      />
    </HeaderWrapper>
  );
});
