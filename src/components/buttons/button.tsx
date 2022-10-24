import { ReactNode } from "react";
import { Button as MuiButton, ButtonProps as MuiButtonProps, colors } from "@mui/material";
import { Icon, IconName, Text } from "components";
import { makeClasses, Margins, Padding } from "utils";
import { CSSObject } from "tss-react";
import Color from "color";

interface ButtonProps extends Omit<MuiButtonProps, "color" | "endIcon" | "startIcon"> {
  color?: string;
  endNode?: ReactNode;
  fontSize?: CSSObject["fontSize"];
  fontWeight?: CSSObject["fontWeight"];
  icon?: IconName;
  iconEnd?: IconName;
  iconEndSize?: string | number;
  iconSize?: string | number;
  margins?: Margins;
  padding?: Padding;
  startNode?: ReactNode;
  text?: string;
  textColor?: string;
}

export const Button = ({
  children,
  className,
  color = colors.blue["800"],
  endNode,
  fontSize,
  fontWeight = 500,
  icon,
  iconEnd,
  iconEndSize = "1.15em",
  iconSize = "1.15em",
  margins = {},
  padding = { all: "0.5em 0.8em" },
  size = "small",
  startNode,
  text,
  textColor = colors.grey["200"],
  variant = "contained",
  ...props
}: ButtonProps) => {
  const { css, cx } = useClasses({
    color,
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
    textColor,
  });

  return (
    <MuiButton {...props} {...{ size, variant }} className={cx(css.root, className)}>
      {startNode}

      {icon && <Icon name={icon} size={iconSize} className={css.icon} />}

      {text && (
        <Text {...{ fontSize, fontWeight }} lineHeight={1}>
          {text}
        </Text>
      )}

      {children}

      {iconEnd && <Icon name={iconEnd} size={iconEndSize} className={css.iconEnd} />}

      {endNode}
    </MuiButton>
  );
};

const useClasses = makeClasses(
  (
    _,
    {
      color,
      margin,
      marginTop,
      marginBottom,
      marginRight,
      marginLeft,
      padding,
      paddingTop,
      paddingBottom,
      paddingRight,
      paddingLeft,
      textColor,
    }
  ) => ({
    icon: {
      marginRight: "0.25em",
    },
    iconEnd: {
      marginLeft: "0.25em",
    },
    root: {
      justifyContent: "center",
      alignItems: "center",
      margin,
      marginTop,
      marginBottom,
      marginRight,
      marginLeft,
      padding,
      paddingTop,
      paddingBottom,
      paddingRight,
      paddingLeft,
      backgroundColor: color,
      color: textColor,
      "&:hover": {
        backgroundColor: Color(color).lighten(0.1).string(),
      },
    },
  })
);
