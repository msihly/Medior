import { useMemo } from "react";
import { Checkbox, Comp, FileFilter, FileFilterProps, View } from "medior/components";

export interface ExtColumnProps
  extends Pick<FileFilterProps["ExtCheckbox"], "selected" | "setSelected"> {
  configTypes: FileFilterProps["ExtCheckbox"]["ext"][];
  label: string;
}

export const ExtColumn = Comp(({ configTypes, label, selected, setSelected }: ExtColumnProps) => {
  const [isAllSelected, isAnySelected] = useMemo(() => {
    const allTypes = Object.values(selected);
    const selectedTypes = allTypes.filter((t) => t === true);
    const isAllSelected = allTypes.length === selectedTypes.length;
    const isAnySelected = selectedTypes.length > 0 && selectedTypes.length !== allTypes.length;
    return [isAllSelected, isAnySelected];
  }, [selected]);

  const toggleSelected = () => {
    setSelected(Object.fromEntries(configTypes.map((t) => [t, isAllSelected ? false : true])));
  };

  return (
    <>
      <Checkbox
        label={label}
        checked={isAllSelected}
        indeterminate={!isAllSelected && isAnySelected}
        setChecked={toggleSelected}
      />

      <View column margins={{ left: "0.5rem" }} overflow="hidden auto">
        {configTypes.map((ext) => (
          <FileFilter.ExtCheckbox key={ext} {...{ ext, selected, setSelected }} />
        ))}
      </View>
    </>
  );
});
