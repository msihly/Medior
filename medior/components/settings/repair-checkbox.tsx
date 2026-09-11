import { Checkbox, Text, View } from "medior/components";
import { colors } from "medior/utils/client";

export interface RepairCheckboxProps {
  checked: boolean;
  description: string;
  disabled: boolean;
  label: string;
  setChecked: (checked: boolean) => void;
}

export const RepairCheckbox = ({
  checked,
  description,
  disabled,
  label,
  setChecked,
}: RepairCheckboxProps) => (
  <Checkbox
    label={
      <View column height="35px">
        <Text fontSize="0.9em">{label}</Text>

        <Text color={colors.custom.lightGrey} fontSize="0.8em" whiteSpace="normal">
          {description}
        </Text>
      </View>
    }
    checked={checked}
    setChecked={setChecked}
    disabled={disabled}
  />
);
