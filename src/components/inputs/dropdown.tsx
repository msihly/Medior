import { MenuItem } from "@mui/material";
import { Input, InputProps, Text } from "components";

export type DropdownOption = {
  label: string;
  value: any;
};

export interface DropdownProps extends InputProps {
  fullWidth?: boolean;
  label: string;
  onChange: (val: any) => any;
  options: DropdownOption[];
  value: any;
}

export const Dropdown = ({
  fullWidth = false,
  label,
  onChange,
  options,
  value,
  ...props
}: DropdownProps) => {
  return (
    <Input {...props} {...{ fullWidth, label, value }} select setValue={onChange}>
      {options.map((o, i) => (
        <MenuItem key={i} value={o.value ?? o.label}>
          <Text>{o.label}</Text>
        </MenuItem>
      ))}
    </Input>
  );
};
