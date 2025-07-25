import {
  Comp,
  HeaderWrapper,
  HeaderWrapperProps,
  SortMenu as SortMenuBase,
  SortMenuProps as SortMenuBaseProps,
} from "medior/components";
import { useStores } from "medior/store";
import { colors, ConfigKey } from "medior/utils/client";

export interface SortMenuProps extends Omit<SortMenuBaseProps, "setValue" | "value"> {
  configKey: ConfigKey;
  header: HeaderWrapperProps["header"];
}

export const SortMenu = Comp(({ configKey, header, width = "10rem", ...props }: SortMenuProps) => {
  const stores = useStores();

  const value = stores.home.settings.getConfigByKey<SortMenuBaseProps["value"]>(configKey);

  const setValue = (value: SortMenuBaseProps["value"]) =>
    stores.home.settings.update({ [configKey]: value });

  return (
    <HeaderWrapper {...{ header, width }} height="100%">
      <SortMenuBase
        {...{ setValue, width, value }}
        color={colors.background}
        hasHeader
        {...props}
      />
    </HeaderWrapper>
  );
});
