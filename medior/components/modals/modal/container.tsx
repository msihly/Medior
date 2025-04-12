import { useRef } from "react";
import Draggable from "react-draggable";
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { Dialog, DialogProps, Paper, PaperProps } from "@mui/material";
import { LoadingOverlay } from "medior/components";
import { colors, CSS, makeClasses } from "medior/utils/client";

export interface ContainerProps
  extends Omit<DialogProps, "maxWidth" | "open" | "onClose" | "title"> {
  closeOnBackdrop?: boolean;
  height?: CSS["height"];
  isLoading?: boolean;
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
  isLoading,
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
      <LoadingOverlay {...{ isLoading }} />

      {children}
    </Dialog>
  );
};

const DraggablePaper = (props: PaperProps) => {
  const { css, cx } = useDraggableClasses(null);

  const ref = useRef(null);

  return (
    <Draggable nodeRef={ref} cancel={'[class*="MuiDialogContent-root"]'}>
      <Paper {...props} ref={ref} className={cx(props.className, css.draggable)} />
    </Draggable>
  );
};

interface ClassesProps {
  height: CSS["height"];
  maxHeight: CSS["maxHeight"];
  maxWidth: CSS["maxWidth"];
  width: CSS["width"];
}

const useClasses = makeClasses((props: ClassesProps) => ({
  modal: {
    "& .MuiDialog-paper": {
      position: "relative",
      maxHeight: props.maxHeight,
      maxWidth: props.maxWidth,
      height: props.height,
      width: props.width,
      background: colors.background,
    },
  },
}));

const useDraggableClasses = makeClasses({
  draggable: {
    cursor: "grab",
    "& .MuiDialogContent-root": {
      cursor: "initial",
    },
  },
});
