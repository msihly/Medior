import { Comp, Dropdown, DropdownProps } from "medior/components";
import { useStores } from "medior/store";

/** Options come from the Settings lists; a value since removed from them stays selectable. */
export const getMediaProgramDetailOptions = (values: string[], value: string) =>
  [...values, ...(value && !values.includes(value) ? [value] : [])].map((option) => ({
    label: option,
    value: option,
  }));

export interface MediaProgramDropdownProps extends Omit<
  DropdownProps,
  "options" | "setValue" | "value"
> {
  field: "languages" | "mediums" | "types";
  setValue: (value: string) => void;
  value: string;
}

export const MediaProgramDropdown = Comp(
  ({ field, setValue, value, ...props }: MediaProgramDropdownProps) => {
    const stores = useStores();

    const options = getMediaProgramDetailOptions(stores.home.settings.mediaPrograms[field], value);

    return <Dropdown {...props} options={options} setValue={setValue} value={value ?? ""} />;
  },
);
