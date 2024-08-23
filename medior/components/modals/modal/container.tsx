import { useRef } from "react";
import Draggable from "react-draggable";
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { Dialog, DialogProps, Paper, PaperProps } from "@mui/material";
import { colors, CSS, makeClasses } from "medior/utils";

export interface ContainerProps
  extends Omit<DialogProps, "maxWidth" | "open" | "onClose" | "title"> {
  closeOnBackdrop?: boolean;
  height?: CSS["height"];
  maxHeight?: CSS["maxHeight"];
  maxWidth?: CSS["maxWidth"];
  onClose?: () => void;
  visible?: boolean;
  width?: CSS["width"];
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
    "& .MuiDialog-paper": {
      position: "relative",
      maxHeight,
      maxWidth,
      height,
      width,
      background: colors.background,
    },
  },
}));
