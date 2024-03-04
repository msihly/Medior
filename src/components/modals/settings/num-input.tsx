import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { NumInput, NumInputProps } from "components";

export interface SettingsNumInputProps extends NumInputProps {}

export const SettingsNumInput = observer(({ setValue, ...props }: SettingsNumInputProps) => {
  const { homeStore } = useStores();

  const handleChange = (value: number) => {
    setValue(value);
    homeStore.setSettingsHasUnsavedChanges(true);
  };

  return (
    <NumInput
      setValue={handleChange}
      disabled={homeStore.isSettingsLoading}
      width="8rem"
      textAlign="center"
      detachLabel
      {...props}
    />
  );
});
