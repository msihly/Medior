import { createElement } from "react";
import { IconProps as MuiIconProps } from "@mui/material";
import * as Icons from "@mui/icons-material";

type IconName = keyof typeof Icons;

export interface IconProps extends Omit<MuiIconProps, "fontSize"> {
  name: IconName;
  size?: number | string;
}

export const Icon = ({ className, color, name = null, size = "small" }: IconProps) => {
  return createElement(Icons[name], { className, style: { color, fontSize: size } });
};
