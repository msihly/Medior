// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { Dialog, DialogProps } from "@mui/material";
import { CSSObject } from "tss-react";
import { makeClasses } from "utils";

export interface ContainerProps
  extends Omit<DialogProps, "maxWidth" | "open" | "onClose" | "title"> {
  closeOnBackdrop?: boolean;
  height?: CSSObject["height"];
  maxHeight?: CSSObject["maxHeight"];
  maxWidth?: CSSObject["maxWidth"];
  onClose?: () => void;
  visible?: boolean;
  width?: CSSObject["width"];
}

export const Container = ({
  children,
  className,
  closeOnBackdrop = true,
  height,
  maxHeight,
  maxWidth = "none",
  onClose,
  scroll = "paper",
  visible = true,
  width,
  ...props
}: ContainerProps) => {
  const { css, cx } = useClasses({ height, maxHeight, maxWidth, width });

  const handleClose = (_, reason: "backdropClick" | "escapeKeyDown") =>
    reason !== "backdropClick" && onClose?.();

  return (
    <Dialog
      {...props}
      {...{ scroll }}
      open={visible}
      onClose={handleClose}
      className={cx(css.modal, className)}
    >
      {children}
    </Dialog>
  );
};

const useClasses = makeClasses((_, { height, maxHeight, maxWidth, width }) => ({
  modal: {
    "& .MuiDialog-paper": { maxHeight, maxWidth, height, width },
  },
}));
