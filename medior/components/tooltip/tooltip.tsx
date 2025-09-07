// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { Tooltip as MuiTooltip, TooltipProps as MuiTooltipProps } from "@mui/material";
import { View, ViewProps } from "medior/components";
import { colors, CSS, makeClasses } from "medior/utils/client";

export interface TooltipProps extends Omit<MuiTooltipProps, "children" | "color"> {
  borderColor?: CSS["color"];
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
  bgColor = colors.background,
  borderColor = colors.custom.blue,
  children,
  color,
  flexShrink = 0,
  fontSize = "0.95em",
  minWidth,
  maxWidth = "25rem",
  placement = "bottom-start",
  title,
  viewProps = {},
  ...props
}: TooltipProps) => {
  const { css } = useClasses({
    borderColor,
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
      classes={{ arrow: css.arrow, popper: css.popper, tooltip: css.tooltip }}
    >
      <View {...viewProps} className={css.container}>
        {children}
      </View>
    </MuiTooltip>
  );
};

interface ClassesProps {
  bgColor: CSS["backgroundColor"];
  borderColor: CSS["color"];
  color: CSS["color"];
  flexShrink: CSS["flexShrink"];
  fontSize: CSS["fontSize"];
  maxWidth: CSS["maxWidth"];
  minWidth: CSS["minWidth"];
}

const useClasses = makeClasses((props: ClassesProps) => ({
  arrow: {
    color: props.borderColor,
  },
  container: {
    display: "flex",
    flexShrink: props.flexShrink,
    overflow: "hidden",
    textOverflow: "ellipsis",
    userSelect: "auto",
  },
  tooltip: {
    border: `2px solid ${props.borderColor}`,
    padding: "0.4rem 0.8rem",
    maxWidth: props.maxWidth,
    minWidth: props.minWidth,
    backgroundColor: props.bgColor,
    color: props.color,
    fontSize: props.fontSize,
    whiteSpace: "pre-wrap",
    boxShadow: "rgb(0 0 0 / 97%) 0px 0px 2px 0px",
  },
  popper: {
    zIndex: 1000000,
  },
}));
