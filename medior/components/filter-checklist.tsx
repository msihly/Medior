import { Checkbox, Comp, Text, View } from "medior/components";
import { colors } from "medior/utils/client";

export interface FilterChecklistProps {
  label: string;
  options: { label: string; value: string }[];
  selected: string[];
  setSelected: (selected: string[]) => void;
}

/** Checked values are matched; none checked matches every value. */
export const FilterChecklist = Comp(
  ({ label, options, selected, setSelected }: FilterChecklistProps) => {
    const handleChecked = (value: string, checked: boolean) =>
      setSelected(checked ? [...selected, value] : selected.filter((cur) => cur !== value));

    return (
      <View column>
        <Text color={colors.custom.lightGrey} fontSize="0.8em">
          {label}
        </Text>

        {options.map((option) => (
          <Checkbox
            key={option.value}
            label={option.label}
            checked={selected.includes(option.value)}
            setChecked={(checked) => handleChecked(option.value, checked)}
            flex="none"
          />
        ))}
      </View>
    );
  },
);
