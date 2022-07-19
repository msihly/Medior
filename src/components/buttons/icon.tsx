import { IconButton as MuiIconButton, IconButtonProps as MuiIconButtonProps } from "@mui/material";
import { Icon, IconName } from "components";
import { ReactNode } from "react";

export interface IconButtonProps extends MuiIconButtonProps {
  children?: ReactNode | ReactNode[];
  name?: IconName;
}

export const IconButton = ({ children, name, onClick, size, ...props }: IconButtonProps) => {
  return (
    <MuiIconButton {...props} {...{ onClick, size }}>
      {name && <Icon name={name} />}
      {children}
    </MuiIconButton>
  );
};
