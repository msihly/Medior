// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { Dialog, DialogProps, Paper, PaperProps } from "@mui/material";
import { useRef } from "react";
import Draggable from "react-draggable";
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
  draggable = false,
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
    (reason === "backdropClick" ? closeOnBackdrop : true) && onClose?.();

  return (
    <Dialog
      {...props}
      {...{ scroll }}
      PaperComponent={draggable ? DraggablePaper : undefined}
      open={visible}
      onClose={handleClose}
      className={cx(css.modal, className)}
    >
      {children}
    </Dialog>
  );
};

const DraggablePaper = (props: PaperProps) => {
  const { css, cx } = useClasses({});

  const ref = useRef(null);

  return (
    <Draggable nodeRef={ref} cancel={'[class*="MuiDialogContent-root"]'}>
      <Paper {...props} ref={ref} className={cx(props.className, css.draggable)} />
    </Draggable>
  );
};

const useClasses = makeClasses((_, { height, maxHeight, maxWidth, width }) => ({
  draggable: {
    cursor: "grab",
    "& .MuiDialogContent-root": {
      cursor: "initial",
    },
  },
  modal: {
    "& .MuiDialog-paper": { position: "relative", maxHeight, maxWidth, height, width },
  },
}));
