import { createElement } from "react";
import { View } from "components";
import { IconProps as MuiIconProps } from "@mui/material";
import * as Icons from "@mui/icons-material";
import { makeClasses, Margins } from "utils";

export type IconName = keyof typeof Icons;

export interface IconProps extends Omit<MuiIconProps, "color" | "fontSize"> {
  color?: string;
  name: IconName & string;
  rotation?: number;
  margins?: Margins;
  size?: number | string;
}

export const Icon = ({ className, color, margins = {}, name, rotation, size }: IconProps) => {
  const { classes: css, cx } = useClasses({
    margin: margins.all,
    marginTop: margins.top,
    marginBottom: margins.bottom,
    marginRight: margins.right,
    marginLeft: margins.left,
    rotation,
  });

  return (
    <View column className={cx(css.root, className)}>
      {createElement(Icons[name], { style: { color, fontSize: size } })}
    </View>
  );
};

const useClasses = makeClasses(
  (_, { margin, marginTop, marginBottom, marginRight, marginLeft, rotation }) => ({
    root: {
      justifyContent: "center",
      transform: rotation !== undefined ? `rotate(${rotation}deg)` : undefined,
      "&.MuiChip-icon": {
        margin,
        marginTop,
        marginBottom,
        marginRight,
        marginLeft,
      },
    },
  })
);
