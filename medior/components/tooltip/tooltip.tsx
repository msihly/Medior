// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { Tooltip as MuiTooltip, TooltipProps as MuiTooltipProps } from "@mui/material";
import { View } from "medior/components";
import { colors, CSS, makeClasses } from "medior/utils";

export interface TooltipProps extends Omit<MuiTooltipProps, "children" | "color"> {
  arrowColor?: CSS["color"];
  bgColor?: CSS["backgroundColor"];
  children: JSX.Element | JSX.Element[];
  color?: CSS["color"];
  flexShrink?: CSS["flexShrink"];
  fontSize?: CSS["fontSize"];
  maxWidth?: CSS["maxWidth"];
  minWidth?: CSS["minWidth"];
}

export const Tooltip = ({
  arrow = true,
  arrowColor = colors.custom.blue,
  bgColor = colors.background,
  children,
  color,
  flexShrink = 0,
  fontSize = "0.85em",
  minWidth,
  maxWidth = "25rem",
  placement = "bottom-start",
  title,
  ...props
}: TooltipProps) => {
  const { css } = useClasses({
    arrowColor,
    bgColor,
    color,
    flexShrink,
    fontSize,
    maxWidth,
    minWidth,
  });

  return (
    <MuiTooltip
      {...props}
      {...{ arrow, placement, title }}
      classes={{ arrow: css.arrow, tooltip: css.tooltip }}
    >
      <View className={css.container}>{children}</View>
    </MuiTooltip>
  );
};

const useClasses = makeClasses(
  ({ arrowColor, bgColor, color, flexShrink, fontSize, maxWidth, minWidth }) => ({
    arrow: {
      paddingBottom: "4px",
      color: arrowColor,
    },
    container: {
      display: "flex",
      flexShrink,
      overflow: "hidden",
      textOverflow: "ellipsis",
      userSelect: "auto",
    },
    tooltip: {
      borderTop: `4px solid ${arrowColor}`,
      maxWidth,
      minWidth,
      backgroundColor: bgColor,
      color,
      fontSize,
      whiteSpace: "pre-wrap",
      boxShadow: "rgb(0 0 0 / 80%) 1px 2px 4px 0px",
    },
  })
);
