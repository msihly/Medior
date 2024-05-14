import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { SortMenu, SortMenuProps, View } from "components";
import { SettingsLabel } from ".";
import { colors } from "utils";
import Color from "color";

export interface SettingsSortMenuProps extends SortMenuProps {
  label: string;
}

export const SettingsSortMenu = observer(({ label, setValue, ...props }: SettingsSortMenuProps) => {
  const stores = useStores();

  const handleChange = (value: SortMenuProps["value"]) => {
    setValue(value);
    stores.home.setSettingsHasUnsavedChanges(true);
  };

  return (
    <View column>
      <SettingsLabel {...{ label }} />
      <SortMenu
        setValue={handleChange}
        disabled={stores.home.isSettingsLoading}
        labelWidth="6rem"
        color={Color(colors.grey["800"]).darken(0.25).string()}
        {...props}
      />
    </View>
  );
});
