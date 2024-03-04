import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { Checkbox, CheckboxProps } from "components";
import { Dispatch, SetStateAction } from "react";

export interface SettingsExtCheckboxProps
  extends Omit<CheckboxProps, "checked" | "label" | "setChecked"> {
  ext: string;
  extTypes: string[];
  setExtTypes: Dispatch<SetStateAction<string[]>>;
}

export const SettingsExtCheckbox = observer(
  ({ ext, extTypes, setExtTypes, ...props }: SettingsExtCheckboxProps) => {
    const { homeStore } = useStores();

    const handleChange = (checked: boolean) => {
      setExtTypes((prev) => (checked ? [...prev, ext] : prev.filter((type) => type !== ext)));
      homeStore.setSettingsHasUnsavedChanges(true);
    };

    return (
      <Checkbox
        label={ext}
        checked={extTypes?.includes(ext)}
        setChecked={handleChange}
        disabled={homeStore.isSettingsLoading}
        flex="inherit"
        fullWidth={false}
        {...props}
      />
    );
  }
);
