import { ReactNode } from "react";
import {
  Button as MuiButton,
  ButtonProps as MuiButtonProps,
  CircularProgress,
  colors,
} from "@mui/material";
import { Icon, IconName, Text, TextProps } from "components";
import { makeClasses, Margins, Padding } from "utils";
import { CSSObject } from "tss-react";
import Color from "color";

interface ButtonProps extends Omit<MuiButtonProps, "color" | "endIcon" | "startIcon"> {
  color?: string;
  endNode?: ReactNode;
  fontSize?: CSSObject["fontSize"];
  fontWeight?: CSSObject["fontWeight"];
  icon?: IconName;
  iconRight?: IconName;
  iconSize?: string | number;
  loading?: boolean;
  margins?: Margins;
  padding?: Padding;
  startNode?: ReactNode;
  text?: string;
  textColor?: string;
  textTransform?: TextProps["textTransform"];
  variant?: "text" | "contained" | "outlined";
}

export const Button = ({
  children,
  className,
  color = colors.blue["800"],
  endNode,
  fontSize = "1.15em",
  fontWeight = 400,
  icon,
  iconRight,
  iconSize = "1.15em",
  loading = false,
  margins = {},
  padding = { all: "0.5em 0.8em" },
  size = "small",
  startNode,
  text,
  textColor = colors.grey["200"],
  textTransform = "none",
  variant = "contained",
  ...props
}: ButtonProps) => {
  const { css, cx } = useClasses({ color, margins, padding, textColor });

  return (
    <MuiButton {...props} {...{ size, variant }} className={cx(css.root, className)}>
      {startNode}

      {icon &&
        (!loading ? (
          <Icon name={icon} size={iconSize} className={css.icon} />
        ) : (
          <CircularProgress color="inherit" size={iconSize} className={css.icon} />
        ))}

      {text && (
        <Text {...{ fontSize, fontWeight, textTransform }} lineHeight={1}>
          {text}
        </Text>
      )}

      {children}

      {iconRight &&
        (!loading ? (
          <Icon name={iconRight} size={iconSize} className={css.iconRight} />
        ) : (
          <CircularProgress color="inherit" size={iconSize} className={css.iconRight} />
        ))}

      {endNode}
    </MuiButton>
  );
};

const useClasses = makeClasses((_, { color, margins, padding, textColor }) => ({
  icon: {
    marginRight: "0.3em",
  },
  iconRight: {
    marginLeft: "0.3em",
  },
  root: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    margin: margins.all,
    marginTop: margins.top,
    marginBottom: margins.bottom,
    marginRight: margins.right,
    marginLeft: margins.left,
    padding: padding.all,
    paddingTop: padding.top,
    paddingBottom: padding.bottom,
    paddingRight: padding.right,
    paddingLeft: padding.left,
    backgroundColor: color,
    color: textColor,
    "&:hover": {
      backgroundColor: Color(color).lighten(0.1).string(),
    },
  },
}));
