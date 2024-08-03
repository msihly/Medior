import { ElementType } from "react";
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { Typography, TypographyProps } from "@mui/material";
import { TooltipProps, TooltipWrapper } from "src/components";
import { colors, makeClasses } from "src/utils";

export interface TextProps extends Omit<TypographyProps, "color" | "component" | "title"> {
  color?: string;
  component?: ElementType;
  preset?: "label-glow";
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
  color?: string;
  preset?: TextProps["preset"];
}

const useClasses = makeClasses((_, { color, preset }: ClassesProps) => ({
  root: {
    color,
    ...(preset === "label-glow"
      ? {
          fontSize: "0.8em",
          textAlign: "center",
          textShadow: `0 0 10px ${colors.blue["600"]}`,
          overflow: "visible",
        }
      : {}),
  },
}));
