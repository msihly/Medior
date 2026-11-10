import { ReactNode } from "react";
import { Checkbox, Comp, View } from "medior/components";
import { CssColor } from "medior/utils/client";

export interface FilterChecklistProps {
  /** Shown under the options, such as a related filter. */
  children?: ReactNode;
  label: string;
  /** Each option's checkbox takes its color, such as a status's chip color. */
  options: { color?: CssColor; label: string; value: string }[];
  selected: string[];
  setSelected: (selected: string[]) => void;
}

/**
 * Options under a checkbox that checks or clears them all, like the file filter's extension
 * columns. Checked values are matched; none checked matches every value.
 */
export const FilterChecklist = Comp(
  ({ children, label, options, selected, setSelected }: FilterChecklistProps) => {
    const isAllSelected =
      options.length > 0 && options.every((option) => selected.includes(option.value));

    const handleChecked = (value: string, checked: boolean) =>
      setSelected(checked ? [...selected, value] : selected.filter((cur) => cur !== value));

    const toggleAll = () => setSelected(isAllSelected ? [] : options.map((option) => option.value));

    return (
      <>
        <Checkbox
          label={label}
          checked={isAllSelected}
          indeterminate={!isAllSelected && selected.length > 0}
          setChecked={toggleAll}
          flex={0}
        />

        <View column flex="1 1 0" margins={{ left: "0.5rem" }} overflow="hidden auto">
          {options.map((option) => (
            <Checkbox
              key={option.value}
              label={option.label}
              checked={selected.includes(option.value)}
              setChecked={(checked) => handleChecked(option.value, checked)}
              color={option.color}
              flex="none"
            />
          ))}

          {children}
        </View>
      </>
    );
  },
);
