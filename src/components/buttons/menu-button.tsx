import { MouseEvent, ReactNode, useState } from "react";
import { Menu } from "@mui/material";
import { IconName } from "components";
import { IconButton, IconButtonProps } from ".";

export interface MenuButtonProps extends IconButtonProps {
  button?: (onOpen: (event: MouseEvent<HTMLButtonElement>) => void) => ReactNode;
  children: ReactNode;
  color?: string;
  icon?: IconName;
}

export const MenuButton = ({
  button,
  children,
  color,
  icon = "MoreVert",
  ...props
}: MenuButtonProps) => {
  const [anchorEl, setAnchorEl] = useState(null);

  const handleClose = () => setAnchorEl(null);

  const handleOpen = (event: MouseEvent<HTMLButtonElement>) => setAnchorEl(event.currentTarget);

  return (
    <>
      {button ? (
        button(handleOpen)
      ) : (
        <IconButton name={icon} onClick={handleOpen} iconProps={{ color }} {...props} />
      )}

      <Menu
        anchorEl={anchorEl}
        anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
        transformOrigin={{ horizontal: "right", vertical: "top" }}
        open={Boolean(anchorEl)}
        onClose={handleClose}
        keepMounted
      >
        {children}
      </Menu>
    </>
  );
};
