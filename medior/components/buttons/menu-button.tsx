import { MouseEvent, ReactNode, useState } from "react";
import { Menu } from "@mui/material";
import { IconName } from "medior/components";
import { IconButton, IconButtonProps } from "medior/components/buttons";
import { colors, CSS, makeClasses } from "medior/utils/client";

export interface MenuButtonProps extends IconButtonProps {
  bgColor?: CSS["backgroundColor"];
  button?: (onOpen: (event: MouseEvent<HTMLButtonElement>) => void) => ReactNode;
  children: ReactNode;
  color?: string;
  icon?: IconName;
  keepMounted?: boolean;
  menuWidth?: CSS["width"];
}

export const MenuButton = ({
  bgColor = colors.background,
  button,
  children,
  color,
  icon = "MoreVert",
  keepMounted = true,
  menuWidth,
  ...props
}: MenuButtonProps) => {
  const { css } = useClasses({ bgColor, menuWidth });

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
        className={css.menu}
      >
        {children}
      </Menu>
    </>
  );
};

interface ClassesProps {
  bgColor: CSS["backgroundColor"];
  menuWidth: CSS["width"];
}

const useClasses = makeClasses((props: ClassesProps) => ({
  menu: {
    "& .MuiPaper-root": {
      background: props.bgColor,
      minWidth: "10rem",
      width: props.menuWidth,
    },
  },
}));
