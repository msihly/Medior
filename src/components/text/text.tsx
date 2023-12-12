import { ElementType } from "react";
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { Typography, TypographyProps } from "@mui/material";
import { TooltipProps, TooltipWrapper } from "components";
import { makeClasses } from "utils";

export interface TextProps extends Omit<TypographyProps, "color" | "component" | "title"> {
  color?: string;
  component?: ElementType;
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
  tooltip,
  tooltipProps,
  ...props
}: TextProps) => {
  const { css, cx } = useClasses({ color });

  return (
    <TooltipWrapper {...{ tooltip, tooltipProps }}>
      <Typography
        {...{ component, fontSize, fontWeight }}
        {...props}
        className={cx(css.root, className)}
      >
        {children}
      </Typography>
    </TooltipWrapper>
  );
};

const useClasses = makeClasses((_, { color }) => ({
  root: {
    color: color,
    overflow: "hidden",
  },
}));
