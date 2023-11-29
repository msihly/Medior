import { createContext, useState } from "react";
import { Menu } from "@mui/material";
import { Button, View } from "components";
import { ButtonProps } from ".";
import { colors } from "utils";

export interface SortMenuContextProps {
  isSortDesc: boolean;
  onChange?: () => void;
  setIsSortDesc: (isSortDesc: boolean) => void;
  setSortKey: (sortKey: string) => void;
  sortKey: string;
}

export const SortMenuContext = createContext<SortMenuContextProps>(null);

export interface SortMenuProps extends Omit<ButtonProps, "onChange">, SortMenuContextProps {
  children: React.ReactNode | React.ReactNode[];
}

export const SortMenu = ({
  children,
  isSortDesc,
  onChange,
  setIsSortDesc,
  setSortKey,
  sortKey,
  ...buttonProps
}: SortMenuProps) => {
  const [anchorEl, setAnchorEl] = useState(null);

  const handleClose = () => setAnchorEl(null);

  const handleOpen = (event) => setAnchorEl(event.currentTarget);

  return (
    <SortMenuContext.Provider value={{ isSortDesc, onChange, setIsSortDesc, setSortKey, sortKey }}>
      <Button
        text="Sort"
        iconRight="Sort"
        onClick={handleOpen}
        color={colors.grey["800"]}
        {...buttonProps}
      />

      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleClose} keepMounted>
        <View>{children}</View>
      </Menu>
    </SortMenuContext.Provider>
  );
};
