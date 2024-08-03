import { MenuItem } from "@mui/material";
import { Input, InputProps, Text } from "src/components";

export type DropdownOption = {
  label: string;
  value: string;
};

export interface DropdownProps extends InputProps {
  fullWidth?: boolean;
  label?: string;
  options: DropdownOption[];
}

export const Dropdown = ({ fullWidth = false, label, options, value, ...props }: DropdownProps) => {
  return (
    <Input {...props} {...{ fullWidth, label, value }} select>
      {options.map((o, i) => (
        <MenuItem key={i} value={o.value ?? o.label}>
          <Text>{o.label}</Text>
        </MenuItem>
      ))}
    </Input>
  );
};
