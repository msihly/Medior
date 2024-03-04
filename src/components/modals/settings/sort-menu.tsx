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
  const { homeStore } = useStores();

  const handleChange = (value: SortMenuProps["value"]) => {
    setValue(value);
    homeStore.setSettingsHasUnsavedChanges(true);
  };

  return (
    <View column>
      <SettingsLabel {...{ label }} />
      <SortMenu
        setValue={handleChange}
        disabled={homeStore.isSettingsLoading}
        labelWidth="6rem"
        color={Color(colors.grey["800"]).darken(0.25).string()}
        {...props}
      />
    </View>
  );
});
