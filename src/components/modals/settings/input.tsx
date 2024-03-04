import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { Input, InputProps } from "components";

export interface SettingsInputProps extends InputProps {}

export const SettingsInput = observer(({ setValue, ...props }: SettingsInputProps) => {
  const { homeStore } = useStores();

  const handleChange = (val: string) => {
    setValue(val);
    homeStore.setSettingsHasUnsavedChanges(true);
  };

  return (
    <Input setValue={handleChange} disabled={homeStore.isSettingsLoading} detachLabel {...props} />
  );
});
