import { MenuItem } from "@mui/material";
import { Input, InputProps, Text } from "medior/components";

export type DropdownOption = {
  label: string;
  value: string;
};

export interface DropdownProps extends InputProps {
  options: DropdownOption[];
}

export const Dropdown = ({ options, value, ...props }: DropdownProps) => {
  return (
    <Input {...props} value={value} select>
      {options.map((o, i) => (
        <MenuItem key={i} value={o.value}>
          <Text>{o.label}</Text>
        </MenuItem>
      ))}
    </Input>
  );
};
