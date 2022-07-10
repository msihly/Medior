import { createElement } from "react";
import { IconButton as MuiIconButton, IconButtonProps as MuiIconButtonProps } from "@mui/material";
import * as Icons from "@mui/icons-material";

type IconName = keyof typeof Icons;

export interface IconButtonProps extends MuiIconButtonProps {
  children?: any;
  name?: IconName;
}

export const IconButton = ({
  children = null,
  name = null,
  onClick,
  size = "small",
  ...props
}: IconButtonProps) => {
  return (
    <MuiIconButton {...props} {...{ onClick, size }}>
      {name && createElement(Icons[name])}
      {children}
    </MuiIconButton>
  );
};
