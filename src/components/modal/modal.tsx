import { ReactNode } from "react";
import { Dialog, DialogActions, DialogContent, DialogProps, DialogTitle } from "@mui/material";
import { CSSObject } from "tss-react";
import { makeClasses } from "utils";

export interface ModalProps extends Omit<DialogProps, "maxWidth" | "open" | "onClose" | "title"> {
  actions?: ReactNode | ReactNode[];
  height?: CSSObject["height"];
  isOpen?: boolean;
  maxHeight?: CSSObject["maxHeight"];
  maxWidth?: CSSObject["maxWidth"];
  title?: ReactNode | ReactNode[];
  width?: CSSObject["width"];
}

export const Modal = ({
  actions,
  children,
  className,
  isOpen = true,
  height,
  maxHeight,
  maxWidth = "none",
  title,
  width,
  ...props
}: ModalProps) => {
  const { css, cx } = useClasses({ height, maxHeight, maxWidth, width });

  return (
    <Dialog {...props} open={isOpen} className={cx(css.modal, className)}>
      {title && <DialogTitle align="center">{title}</DialogTitle>}

      <DialogContent dividers className={css.body}>
        {children}
      </DialogContent>

      {actions && <DialogActions className={css.actions}>{actions}</DialogActions>}
    </Dialog>
  );
};

const useClasses = makeClasses((_, { height, maxHeight, maxWidth, width }) => ({
  actions: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "center",
    "& > *:not(:last-child)": { marginRight: "0.5rem" },
  },
  body: {
    display: "flex",
    flex: 1,
  },
  modal: {
    "& .MuiDialog-paper": { maxHeight, maxWidth, height, width },
  },
}));
