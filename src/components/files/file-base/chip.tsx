import { ReactNode } from "react";
import { Chip as MuiChip } from "@mui/material";
import { Icon, IconName } from "components";
import { Padding, colors, makeClasses } from "utils";
import { CSSObject } from "tss-react";

interface ChipProps {
  height?: CSSObject["height"];
  icon?: IconName;
  iconColor?: string;
  label: ReactNode;
  opacity?: number;
  padding?: Padding;
  position: "top-left" | "top-right" | "bottom-left" | "bottom-right";
}

export const Chip = ({
  height,
  icon,
  iconColor,
  label,
  opacity = 0.5,
  padding,
  position,
}: ChipProps) => {
  const { css } = useClasses({ height, opacity, padding, position });

  return (
    <MuiChip
      icon={
        icon ? (
          <Icon name={icon} color={iconColor} size="inherit" margins={{ left: "0.5rem" }} />
        ) : undefined
      }
      label={label}
      className={css.chip}
    />
  );
};

const useClasses = makeClasses((_, { height, opacity, padding, position }) => ({
  chip: {
    position: "absolute",
    top: position.includes("top") ? "0.5rem" : undefined,
    right: position.includes("right") ? "0.5rem" : undefined,
    bottom: position.includes("bottom") ? "0.5rem" : undefined,
    left: position.includes("left") ? "0.5rem" : undefined,
    height,
    backgroundColor: colors.grey["900"],
    cursor: "pointer",
    transition: "all 200ms ease-in-out",
    opacity: opacity,
    "&:hover": { opacity: Math.min(1, opacity + 0.3) },
    "& > .MuiChip-label": {
      padding: padding?.all,
      paddingTop: padding?.top,
      paddingBottom: padding?.bottom,
      paddingLeft: padding?.left,
      paddingRight: padding?.right,
    },
  },
}));
