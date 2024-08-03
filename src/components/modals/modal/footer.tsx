import { ReactNode } from "react";
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { DialogActions } from "@mui/material";
import { makeClasses } from "src/utils";

interface FooterProps {
  children: ReactNode | ReactNode[];
}

export const Footer = ({ children }: FooterProps) => {
  const { css } = useClasses(null);

  return <DialogActions className={css.actions}>{children}</DialogActions>;
};

const useClasses = makeClasses({
  actions: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "center",
    "& > *:not(:last-child)": { marginRight: "0.5rem" },
  },
});
