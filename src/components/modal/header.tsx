import { ReactNode } from "react";
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { DialogTitle } from "@mui/material";
import { makeClasses } from "utils";

interface HeaderProps {
  children: ReactNode | ReactNode[];
  className?: string;
}

export const Header = ({ children, className }: HeaderProps) => {
  const { css, cx } = useClasses(null);

  return <DialogTitle className={cx(css.root, className)}>{children}</DialogTitle>;
};

const useClasses = makeClasses({
  root: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
});
