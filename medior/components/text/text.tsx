import { ElementType } from "react";
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { Typography, TypographyProps } from "@mui/material";
import { TooltipProps, TooltipWrapper } from "medior/components";
import { colors, makeClasses } from "medior/utils";

export interface TextProps extends Omit<TypographyProps, "color" | "component" | "title"> {
  color?: string;
  component?: ElementType;
  preset?: "label-glow" | "sub-text";
  tooltip?: TooltipProps["title"];
  tooltipProps?: Partial<TooltipProps>;
}

export const Text = ({
  children,
  className,
  color,
  component = "span",
  fontSize = "1em",
  fontWeight = 400,
  overflow = "hidden",
  preset,
  tooltip,
  tooltipProps,
  ...props
}: TextProps) => {
  const { css, cx } = useClasses({ color, preset });

  return (
    <TooltipWrapper {...{ tooltip, tooltipProps }}>
      <Typography
        {...{ component, fontSize, fontWeight, overflow }}
        {...props}
        className={cx(css.root, className)}
      >
        {children}
      </Typography>
    </TooltipWrapper>
  );
};

interface ClassesProps {
  color: string;
  preset: TextProps["preset"];
}

const useClasses = makeClasses((_, props: ClassesProps) => ({
  root: {
    color: props.color,
    ...(props.preset === "label-glow"
      ? {
          color: colors.custom.white,
          fontSize: "0.8em",
          textAlign: "center",
          textShadow: `0 0 10px ${colors.custom.blue}`,
          overflow: "visible",
        }
      : props.preset === "sub-text"
        ? {
            color: colors.custom.grey,
            fontSize: "0.7em",
            whiteSpace: "nowrap",
            textOverflow: "ellipsis",
          }
        : {}),
  },
}));
