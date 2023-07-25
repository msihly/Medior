import { ElementType } from "react";
import { Typography, TypographyProps } from "@mui/material";
import { makeClasses } from "utils";

export interface TextProps extends Omit<TypographyProps, "color" | "component"> {
  color?: string;
  component?: ElementType;
}

export const Text = ({
  children,
  className = null,
  color,
  component = "span",
  fontSize = "1em",
  fontWeight = 400,
  ...props
}: TextProps) => {
  const { css, cx } = useClasses({ color });

  return (
    <Typography
      {...{ component, fontSize, fontWeight }}
      {...props}
      className={cx(css.root, className)}
    >
      {children}
    </Typography>
  );
};

const useClasses = makeClasses((_, { color }) => ({
  root: {
    color: color,
  },
}));
