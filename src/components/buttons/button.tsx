import { MouseEvent, ReactNode } from "react";
import {
  // eslint-disable-next-line @typescript-eslint/no-restricted-imports
  Button as MuiButton,
  // eslint-disable-next-line @typescript-eslint/no-restricted-imports
  ButtonProps as MuiButtonProps,
  CircularProgress,
} from "@mui/material";
import {
  Icon,
  IconName,
  IconProps,
  Text,
  TextProps,
  TooltipProps,
  TooltipWrapper,
  View,
} from "components";
import { colors, makeClasses, Margins, Padding } from "utils";
import { CSSObject } from "tss-react";
import Color from "color";

export interface ButtonProps
  extends Omit<MuiButtonProps, "color" | "endIcon" | "startIcon" | "type" | "variant"> {
  color?: string;
  circle?: boolean;
  endNode?: ReactNode;
  fontSize?: CSSObject["fontSize"];
  fontWeight?: CSSObject["fontWeight"];
  icon?: IconName;
  iconProps?: Partial<IconProps>;
  iconRight?: IconName;
  iconSize?: string | number;
  loading?: boolean;
  margins?: Margins;
  outlined?: boolean;
  outlineFill?: string;
  padding?: Padding;
  startNode?: ReactNode;
  text?: string;
  textColor?: string;
  textTransform?: TextProps["textTransform"];
  tooltip?: TooltipProps["title"];
  tooltipProps?: Partial<TooltipProps>;
  type?: "button" | "link";
}

export const Button = ({
  children,
  circle = false,
  className,
  color = colors.button.blue,
  endNode,
  fontSize = "1.15em",
  fontWeight = 400,
  href,
  icon,
  iconProps,
  iconRight,
  iconSize = "1.15em",
  loading = false,
  margins,
  onClick,
  outlined = false,
  outlineFill = "transparent",
  padding,
  size = "small",
  startNode,
  text,
  textColor,
  textTransform = "none",
  tooltip,
  tooltipProps,
  type = "button",
  ...props
}: ButtonProps) => {
  const { css, cx } = useClasses({
    isCircle: circle,
    isLink: type === "link",
    color,
    margins,
    outlined,
    outlineFill,
    padding: { all: !text?.length ? "0.4em" : "0.4em 0.8em", ...padding },
    textColor,
  });

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    onClick?.(event);
    if (href) window.open(href, "_blank");
  };

  return (
    <TooltipWrapper {...{ tooltip, tooltipProps }}>
      <MuiButton
        {...props}
        {...{ size }}
        onClick={handleClick}
        variant="contained"
        className={cx(css.root, className)}
      >
        {startNode}

        {icon && (
          <View margins={text || iconRight ? { right: "0.3em" } : undefined}>
            {!loading ? (
              <Icon name={icon} size={iconSize} {...iconProps} />
            ) : (
              <CircularProgress color="inherit" size={iconSize} />
            )}
          </View>
        )}

        {text && (
          <Text
            {...{ fontSize, fontWeight, textTransform, tooltip, tooltipProps }}
            className={css.text}
          >
            {text}
          </Text>
        )}

        {children}

        {iconRight && (
          <View margins={text || icon ? { left: "0.3em" } : undefined}>
            {!loading ? (
              <Icon name={iconRight} size={iconSize} />
            ) : (
              <CircularProgress color="inherit" size={iconSize} />
            )}
          </View>
        )}

        {endNode}
      </MuiButton>
    </TooltipWrapper>
  );
};

const useClasses = makeClasses(
  (_, { color, isCircle, isLink, margins, outlined, outlineFill, padding, textColor }) => ({
    root: {
      display: "flex",
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
      border: `1px solid ${outlined ? color : "transparent"}`,
      borderRadius: isCircle ? "50%" : undefined,
      margin: margins?.all,
      marginTop: margins?.top,
      marginBottom: margins?.bottom,
      marginRight: margins?.right,
      marginLeft: margins?.left,
      padding: padding?.all,
      paddingTop: padding?.top ?? isLink ? 0 : undefined,
      paddingBottom: padding?.bottom ?? isLink ? 0 : undefined,
      paddingRight: padding?.right ?? isLink ? 0 : undefined,
      paddingLeft: padding?.left ?? isLink ? 0 : undefined,
      minWidth: "fit-content",
      backgroundColor: isLink ? "transparent" : outlined ? outlineFill : color,
      boxShadow: isLink ? "none" : undefined,
      color: outlined
        ? color
        : textColor ?? (isLink ? colors.blue["300"] : outlined ? color : colors.grey["200"]),
      "&:hover": {
        backgroundColor: isLink
          ? "transparent"
          : Color(outlined ? outlineFill : color)
              .lighten(0.1)
              .string(),
        boxShadow: isLink ? "none" : undefined,
        textDecoration: isLink ? "underline" : undefined,
      },
    },
    text: {
      lineHeight: 1,
      overflow: "hidden",
      textOverflow: "ellipsis",
    },
  })
);
