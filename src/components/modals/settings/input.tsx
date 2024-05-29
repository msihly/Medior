import { observer, useStores } from "store";
import { Input, InputProps } from "components";

export interface SettingsInputProps extends InputProps {}

export const SettingsInput = observer(({ setValue, ...props }: SettingsInputProps) => {
  const stores = useStores();

  const handleChange = (val: string) => {
    setValue(val);
    stores.home.setSettingsHasUnsavedChanges(true);
  };

  return (
    <Input
      setValue={handleChange}
      disabled={stores.home.isSettingsLoading}
      detachLabel
      {...props}
    />
  );
});
