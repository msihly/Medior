import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { Checkbox, CheckboxProps } from "components";

export interface SettingsCheckboxProps extends CheckboxProps {}

export const SettingsCheckbox = observer(({ setChecked, ...props }: SettingsCheckboxProps) => {
  const { homeStore } = useStores();

  const handleChange = (checked: boolean) => {
    setChecked(checked);
    homeStore.setSettingsHasUnsavedChanges(true);
  };

  return (
    <Checkbox
      setChecked={handleChange}
      disabled={homeStore.isSettingsLoading}
      flex="inherit"
      {...props}
    />
  );
});
