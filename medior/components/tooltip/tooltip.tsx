// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { Tooltip as MuiTooltip, TooltipProps as MuiTooltipProps } from "@mui/material";
import { View, ViewProps } from "medior/components";
import { colors, CSS, makeClasses } from "medior/utils/client";

export interface TooltipProps extends Omit<MuiTooltipProps, "children" | "color"> {
  arrowColor?: CSS["color"];
  bgColor?: CSS["backgroundColor"];
  children: JSX.Element | JSX.Element[];
  color?: CSS["color"];
  flexShrink?: CSS["flexShrink"];
  fontSize?: CSS["fontSize"];
  maxWidth?: CSS["maxWidth"];
  minWidth?: CSS["minWidth"];
  viewProps?: Partial<ViewProps>;
}

export const Tooltip = ({
  arrow = true,
  arrowColor = colors.foreground,
  bgColor = colors.foreground,
  children,
  color,
  flexShrink = 0,
  fontSize = "0.85em",
  minWidth,
  maxWidth = "25rem",
  placement = "bottom-start",
  title,
  viewProps = {},
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
      <View {...viewProps} className={css.container}>
        {children}
      </View>
    </MuiTooltip>
  );
};

interface ClassesProps {
  arrowColor: CSS["color"];
  bgColor: CSS["backgroundColor"];
  color: CSS["color"];
  flexShrink: CSS["flexShrink"];
  fontSize: CSS["fontSize"];
  maxWidth: CSS["maxWidth"];
  minWidth: CSS["minWidth"];
}

const useClasses = makeClasses((props: ClassesProps) => ({
  arrow: {
    color: props.arrowColor,
  },
  container: {
    display: "flex",
    flexShrink: props.flexShrink,
    overflow: "hidden",
    textOverflow: "ellipsis",
    userSelect: "auto",
  },
  tooltip: {
    padding: "0.5rem",
    maxWidth: props.maxWidth,
    minWidth: props.minWidth,
    backgroundColor: props.bgColor,
    color: props.color,
    fontSize: props.fontSize,
    whiteSpace: "pre-wrap",
    boxShadow: "rgb(0 0 0 / 97%) 0px 0px 8px 0px",
  },
}));
