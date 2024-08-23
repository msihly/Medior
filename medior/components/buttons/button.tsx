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
  TooltipProps,
  TooltipWrapper,
  View,
} from "medior/components";
import { colors, CSS, makeClasses, Margins, Padding } from "medior/utils";
import Color from "color";

export interface ButtonProps
  extends Omit<
    MuiButtonProps,
    "color" | "endIcon" | "fullWidth" | "startIcon" | "type" | "variant"
  > {
  color?: string;
  colorOnHover?: string;
  circle?: boolean;
  endNode?: ReactNode;
  fontSize?: CSS["fontSize"];
  fontWeight?: CSS["fontWeight"];
  icon?: IconName;
  iconProps?: Partial<IconProps>;
  iconRight?: IconName;
  iconSize?: string | number;
  justify?: CSS["justifyContent"];
  loading?: boolean;
  margins?: Margins;
  outlined?: boolean;
  outlineFill?: string;
  padding?: Padding;
  startNode?: ReactNode;
  text?: string;
  textColor?: string;
  textClassName?: string;
  textTransform?: CSS["textTransform"];
  tooltip?: TooltipProps["title"];
  tooltipProps?: Partial<TooltipProps>;
  type?: "button" | "link";
  width?: CSS["width"];
}

export const Button = ({
  children,
  circle = false,
  className,
  color = colors.custom.grey,
  colorOnHover,
  endNode,
  fontSize = "1.15em",
  fontWeight = 400,
  href,
  icon,
  iconProps,
  iconRight,
  iconSize = "1.15em",
  justify = "center",
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
  textClassName,
  textTransform = "none",
  tooltip,
  tooltipProps,
  type = "button",
  width,
  ...props
}: ButtonProps) => {
  const { css, cx } = useClasses({
    color,
    colorOnHover,
    isCircle: circle,
    isLink: type === "link",
    justify,
    margins,
    outlined,
    outlineFill,
    padding: { all: !text?.length ? "0.4em" : "0.4em 0.8em", ...padding },
    textColor,
    textTransform,
    width,
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
            {...{ fontSize, fontWeight, tooltip, tooltipProps }}
            className={cx(css.text, className)}
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

interface ClassesProps {
  color: string;
  colorOnHover: string;
  isCircle: boolean;
  isLink: boolean;
  justify: CSS["justifyContent"];
  margins: Margins;
  outlined: boolean;
  outlineFill: string;
  padding: Padding;
  textColor: string;
  textTransform: CSS["textTransform"];
  width: CSS["width"];
}

const useClasses = makeClasses(
  (
    _,
    {
      color,
      colorOnHover,
      isCircle,
      isLink,
      justify,
      margins,
      outlined,
      outlineFill,
      padding,
      textColor,
      textTransform,
      width,
    }: ClassesProps
  ) => ({
    root: {
      display: "flex",
      flexDirection: "row",
      justifyContent: justify,
      alignItems: "center",
      border: `1px solid ${outlined ? color : "transparent"}`,
      borderRadius: isCircle ? "50%" : undefined,
      margin: margins?.all,
      marginTop: margins?.top,
      marginBottom: margins?.bottom,
      marginRight: margins?.right,
      marginLeft: margins?.left,
      padding: padding?.all,
      paddingTop: padding?.top ?? (isLink ? 0 : undefined),
      paddingBottom: padding?.bottom ?? (isLink ? 0 : undefined),
      paddingRight: padding?.right ?? (isLink ? 0 : undefined),
      paddingLeft: padding?.left ?? (isLink ? 0 : undefined),
      minWidth: "fit-content",
      width,
      backgroundColor: isLink ? "transparent" : outlined ? outlineFill : color,
      boxShadow: isLink ? "none" : undefined,
      color: outlined
        ? color
        : (textColor ?? (isLink ? colors.custom.blue : outlined ? color : colors.custom.white)),
      textTransform,
      "&:hover": {
        background: isLink
          ? "transparent"
          : colorOnHover ||
            Color(outlined ? outlineFill : color)
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
      transition: "all 100ms ease-in-out",
      textTransform,
    },
  })
);
