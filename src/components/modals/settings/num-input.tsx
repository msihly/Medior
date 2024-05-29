import { observer, useStores } from "store";
import { NumInput, NumInputProps } from "components";

export interface SettingsNumInputProps extends NumInputProps {}

export const SettingsNumInput = observer(({ setValue, ...props }: SettingsNumInputProps) => {
  const stores = useStores();

  const handleChange = (value: number) => {
    setValue(value);
    stores.home.setSettingsHasUnsavedChanges(true);
  };

  return (
    <NumInput
      setValue={handleChange}
      disabled={stores.home.isSettingsLoading}
      width="8rem"
      textAlign="center"
      detachLabel
      {...props}
    />
  );
});
