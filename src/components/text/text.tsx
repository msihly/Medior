import { Typography, TypographyProps } from "@mui/material";
import { ElementType } from "react";
import { makeClasses } from "utils";

interface TextProps extends Omit<TypographyProps, "color"> {
  bold?: boolean;
  color?: string;
  component?: ElementType;
}

export const Text = ({
  bold = false,
  children,
  className = null,
  color,
  component = "span",
  fontSize = "1em",
  fontWeight = 400,
  ...props
}: TextProps) => {
  const { css, cx } = useClasses({ bold, color });

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
