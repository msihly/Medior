import { ReactNode } from "react";
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { DialogTitle } from "@mui/material";
import { makeClasses } from "utils";
import { CSSObject } from "tss-react";

interface HeaderProps {
  children: ReactNode | ReactNode[];
  className?: string;
  justify?: CSSObject["justifyContent"];
}

export const Header = ({ children, className, justify = "center" }: HeaderProps) => {
  const { css, cx } = useClasses({ justify });

  return <DialogTitle className={cx(css.root, className)}>{children}</DialogTitle>;
};

const useClasses = makeClasses((_, { justify }) => ({
  root: {
    display: "flex",
    flexDirection: "row",
    justifyContent: justify,
    alignItems: "center",
    padding: "0.5rem 1rem",
    textAlign: "center",
  },
}));
