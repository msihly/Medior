import { ReactNode } from "react";
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { Chip as MuiChip, ChipProps as MuiChipProps } from "@mui/material";
import { Icon, IconName, IconProps } from "medior/components";
import { CSS, makeClasses, makePadding, Padding } from "medior/utils";

export interface ChipProps extends Omit<MuiChipProps, "color" | "icon"> {
  bgColor?: CSS["backgroundColor"];
  className?: string;
  color?: CSS["color"];
  height?: CSS["height"];
  icon?: IconName;
  iconColor?: string;
  iconProps?: Partial<IconProps>;
  label: ReactNode;
  padding?: Padding;
  width?: CSS["width"];
}

export const Chip = ({
  bgColor,
  className,
  color,
  height,
  icon,
  iconColor,
  iconProps,
  label,
  padding,
  width,
  ...props
}: ChipProps) => {
  const { css, cx } = useClasses({ bgColor, color, height, padding, width });

  return (
    <MuiChip
      {...props}
      {...{ label }}
      icon={
        icon ? (
          <Icon
            name={icon}
            color={iconColor}
            size="inherit"
            margins={{ left: "0.5rem !important" }}
            {...iconProps}
          />
        ) : undefined
      }
      className={cx(css.chip, className)}
    />
  );
};

interface ClassesProps {
  bgColor: CSS["backgroundColor"];
  color: CSS["color"];
  height: CSS["height"];
  padding: Padding;
  width: CSS["width"];
}

const useClasses = makeClasses((props: ClassesProps) => ({
  chip: {
    height: props.height,
    backgroundColor: props.bgColor,
    color: props.color,
    transition: "all 200ms ease-in-out",
    width: props.width,
    "& > .MuiChip-label": {
      ...makePadding(props.padding),
    },
  },
}));
