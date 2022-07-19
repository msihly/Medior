import { createElement } from "react";
import { View } from "components";
import { IconProps as MuiIconProps } from "@mui/material";
import * as Icons from "@mui/icons-material";
import { makeClasses } from "utils";

export type IconName = keyof typeof Icons;

export interface IconProps extends Omit<MuiIconProps, "color" | "fontSize"> {
  color?: string;
  name: IconName & string;
  size?: number | string;
}

export const Icon = ({ className, color, name, size }: IconProps) => {
  const { classes: css, cx } = useClasses(null);

  return (
    <View column className={cx(css.root, className)}>
      {createElement(Icons[name], { style: { color, fontSize: size } })}
    </View>
  );
};

const useClasses = makeClasses({
  root: {
    justifyContent: "center",
  },
});
