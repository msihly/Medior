import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { Checkbox, CheckboxProps } from "components";

export interface SettingsCheckboxProps extends CheckboxProps {}

export const SettingsCheckbox = observer(({ setChecked, ...props }: SettingsCheckboxProps) => {
  const stores = useStores();

  const handleChange = (checked: boolean) => {
    setChecked(checked);
    stores.home.setSettingsHasUnsavedChanges(true);
  };

  return (
    <Checkbox
      setChecked={handleChange}
      disabled={stores.home.isSettingsLoading}
      flex="inherit"
      {...props}
    />
  );
});
