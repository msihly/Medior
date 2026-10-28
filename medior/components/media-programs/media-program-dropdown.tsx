import { Comp, Dropdown, DropdownProps } from "medior/components";
import { useStores } from "medior/store";

export interface MediaProgramDropdownProps extends Omit<
  DropdownProps,
  "options" | "setValue" | "value"
> {
  field: "languages" | "mediums" | "types";
  setValue: (value: string) => void;
  value: string;
}

/** Options come from the Settings lists; a value since removed from them stays selectable. */
export const MediaProgramDropdown = Comp(
  ({ field, setValue, value, ...props }: MediaProgramDropdownProps) => {
    const stores = useStores();

    const values = stores.home.settings.mediaPrograms[field];

    const options = [...values, ...(value && !values.includes(value) ? [value] : [])].map(
      (option) => ({ label: option, value: option }),
    );

    return <Dropdown {...props} options={options} setValue={setValue} value={value ?? ""} />;
  },
);
