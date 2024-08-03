import { MouseEvent, ReactNode, useState } from "react";
import { Menu } from "@mui/material";
import { IconName } from "src/components";
import { IconButton, IconButtonProps } from ".";

export interface MenuButtonProps extends IconButtonProps {
  button?: (onOpen: (event: MouseEvent<HTMLButtonElement>) => void) => ReactNode;
  children: ReactNode;
  color?: string;
  icon?: IconName;
  keepMounted?: boolean;
}

export const MenuButton = ({
  button,
  children,
  color,
  icon = "MoreVert",
  keepMounted = true,
  ...props
}: MenuButtonProps) => {
  const [anchorEl, setAnchorEl] = useState(null);

  const handleClose = () => setAnchorEl(null);

  const handleOpen = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setAnchorEl(event.currentTarget);
  };

  return (
    <>
      {button ? (
        button(handleOpen)
      ) : (
        <IconButton name={icon} onClick={handleOpen} iconProps={{ color }} {...props} />
      )}

      <Menu
        {...{ anchorEl, keepMounted }}
        open={Boolean(anchorEl)}
        onClose={handleClose}
        anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
        transformOrigin={{ horizontal: "right", vertical: "top" }}
      >
        {children}
      </Menu>
    </>
  );
};
