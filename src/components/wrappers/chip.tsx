import { ReactNode } from "react";
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { Chip as MuiChip, ChipProps as MuiChipProps } from "@mui/material";
import { Icon, IconName } from "src/components";
import { CSS, makeClasses, Padding } from "src/utils";

export interface ChipProps extends Omit<MuiChipProps, "color" | "icon"> {
  bgColor?: CSS["backgroundColor"];
  className?: string;
  color?: CSS["color"];
  height?: CSS["height"];
  icon?: IconName;
  iconColor?: string;
  label: ReactNode;
  padding?: Padding;
}

export const Chip = ({
  bgColor,
  className,
  color,
  height,
  icon,
  iconColor,
  label,
  padding,
  ...props
}: ChipProps) => {
  const { css, cx } = useClasses({ bgColor, color, height, padding });

  return (
    <MuiChip
      {...props}
      {...{ label }}
      icon={
        icon ? (
          <Icon name={icon} color={iconColor} size="inherit" margins={{ left: "0.5rem" }} />
        ) : undefined
      }
      className={cx(css.chip, className)}
    />
  );
};

const useClasses = makeClasses((_, { bgColor, color, height, padding }) => ({
  chip: {
    height,
    backgroundColor: bgColor,
    color,
    transition: "all 200ms ease-in-out",
    "& > .MuiChip-label": {
      padding: padding?.all,
      paddingTop: padding?.top,
      paddingBottom: padding?.bottom,
      paddingLeft: padding?.left,
      paddingRight: padding?.right,
    },
  },
}));
