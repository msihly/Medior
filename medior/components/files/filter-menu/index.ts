import { ExtCheckbox, ExtCheckboxProps } from "./ext-checkbox";
import { ExtColumn, ExtColumnProps } from "./ext-column";
import { FileFilterMenu, FileFilterMenuProps } from "./file-filter-menu";

export const FileFilter = {
  ExtCheckbox,
  ExtColumn,
  Menu: FileFilterMenu,
};

export type FileFilterProps = {
  ExtCheckbox: ExtCheckboxProps;
  ExtColumn: ExtColumnProps;
  Menu: FileFilterMenuProps;
};
