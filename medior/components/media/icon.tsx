// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { Icon as MuiIcon, IconProps as MuiIconProps } from "@mui/material";
import { IconName as MuiIconName } from "@mui/icons-material";
import { View, ViewProps } from "medior/components";
import { makeClasses, Margins } from "medior/utils";

export type IconName = MuiIconName;

export interface IconProps extends Omit<MuiIconProps, "color" | "fontSize"> {
  color?: string;
  name: IconName & string;
  rotation?: number;
  margins?: Margins;
  size?: number | string;
  viewProps?: Partial<Omit<ViewProps, "margins">>;
}

export const Icon = ({
  className,
  color,
  margins,
  name,
  rotation,
  size,
  viewProps = {},
  ...props
}: IconProps) => {
  const { css, cx } = useClasses({
    rotation,
  });

  const nameToSnakeCase =
    name?.length &&
    name
      .split(/(?=[A-Z])/)
      .join("_")
      .toLowerCase();

  return (
    <View column className={cx(css.root, className)} margins={margins} {...viewProps}>
      <MuiIcon {...props} style={{ color, fontSize: size }}>
        {nameToSnakeCase}
      </MuiIcon>
    </View>
  );
};

const useClasses = makeClasses(({ rotation }) => ({
  root: {
    justifyContent: "center",
    transform: rotation !== undefined ? `rotate(${rotation}deg)` : undefined,
    transition: "all 200ms ease-in-out",
  },
}));
