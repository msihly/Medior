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
import { colors, CSS, makeClasses, makeMargins, Margins, Padding } from "medior/utils";
import Color from "color";

export interface ButtonProps
  extends Omit<
    MuiButtonProps,
    "color" | "endIcon" | "fullWidth" | "startIcon" | "type" | "variant"
  > {
  boxShadow?: CSS["boxShadow"];
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
  boxShadow,
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
    boxShadow,
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
  boxShadow: CSS["boxShadow"];
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

const useClasses = makeClasses((props: ClassesProps) => ({
  root: {
    display: "flex",
    flexDirection: "row",
    justifyContent: props.justify,
    alignItems: "center",
    border: `1px solid ${props.outlined ? props.color : "transparent"}`,
    borderRadius: props.isCircle ? "50%" : undefined,
    ...makeMargins(props.margins),
    padding: props.padding?.all,
    paddingTop: props.padding?.top ?? (props.isLink ? 0 : undefined),
    paddingBottom: props.padding?.bottom ?? (props.isLink ? 0 : undefined),
    paddingRight: props.padding?.right ?? (props.isLink ? 0 : undefined),
    paddingLeft: props.padding?.left ?? (props.isLink ? 0 : undefined),
    minWidth: "fit-content",
    width: props.width,
    backgroundColor: props.isLink
      ? "transparent"
      : props.outlined
      ? props.outlineFill
      : props.color,
    boxShadow:
      props.boxShadow ??
      (props.isLink
        ? "none"
        : "0px 3px 1px -2px rgba(0,0,0,0.2), 0px 2px 2px 0px rgba(0,0,0,0.14), 0px 1px 5px 0px rgba(0,0,0,0.12)"),
    color: props.outlined
      ? props.color
      : props.textColor ??
        (props.isLink
          ? colors.custom.lightBlue
          : props.outlined
          ? props.color
          : colors.custom.white),
    textTransform: props.textTransform,
    "&:hover": {
      background: props.isLink
        ? "transparent"
        : props.colorOnHover ||
          Color(props.outlined ? props.outlineFill : props.color)
            .lighten(0.1)
            .string(),
      boxShadow: props.isLink ? "none" : undefined,
      textDecoration: props.isLink ? "underline" : undefined,
    },
  },
  text: {
    lineHeight: 1.1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    transition: "all 100ms ease-in-out",
    textTransform: props.textTransform,
  },
}));
