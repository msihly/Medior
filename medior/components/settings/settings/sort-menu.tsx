import { observer, useStores } from "medior/store";
import {
  HeaderWrapper,
  HeaderWrapperProps,
  SortMenu as SortMenuBase,
  SortMenuProps as SortMenuBaseProps,
} from "medior/components";
import { colors, ConfigKey } from "medior/utils";

export interface SortMenuProps extends Omit<SortMenuBaseProps, "setValue" | "value"> {
  configKey: ConfigKey;
  header: HeaderWrapperProps["header"];
}

export const SortMenu = observer(
  ({ configKey, header, width = "10rem", ...props }: SortMenuProps) => {
    const stores = useStores();

    const value = stores.home.settings.getConfigByKey<SortMenuBaseProps["value"]>(configKey);

    const setValue = (value: SortMenuBaseProps["value"]) =>
      stores.home.settings.update({ [configKey]: value });

    return (
      <HeaderWrapper header={header} width={width}>
        <SortMenuBase {...{ setValue, value }} width={width} color={colors.background} {...props} />
      </HeaderWrapper>
    );
  }
);
