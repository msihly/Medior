import { Dispatch, SetStateAction } from "react";
import { Button, Icon, IconName, Modal, Text } from "medior/components";
import { colors } from "medior/utils";

export interface ConfirmModalProps {
  cancelColor?: string;
  cancelIcon?: IconName;
  cancelText?: string;
  confirmColor?: string;
  confirmIcon?: IconName;
  confirmText?: string;
  headerText?: string;
  onCancel?: () => void;
  onConfirm: () => Promise<boolean> | void;
  setVisible: Dispatch<SetStateAction<boolean>>;
  subText: string;
}

export const ConfirmModal = ({
  cancelColor = colors.custom.grey,
  cancelIcon = "Close",
  cancelText = "Cancel",
  confirmColor = colors.custom.red,
  confirmIcon = "Delete",
  confirmText = "Delete",
  headerText = "Confirm Delete",
  onCancel,
  onConfirm,
  setVisible,
  subText,
}: ConfirmModalProps) => {
  const handleClose = () => setVisible(false);

  const handleCancel = () => {
    onCancel?.();
    handleClose();
  };

  const handleConfirm = async () => {
    if (onConfirm instanceof Promise) {
      const success = await onConfirm();
      if (success) handleClose();
    } else {
      onConfirm();
      handleClose();
    }
  };

  return (
    <Modal.Container
      onClose={handleCancel}
      height="100%"
      width="100%"
      maxHeight="20rem"
      maxWidth="25rem"
    >
      <Modal.Header>
        <Text preset="title">{headerText}</Text>
      </Modal.Header>

      <Modal.Content align="center" justify="center">
        <Icon name="Delete" color={colors.custom.red} size="5rem" />

        <Text fontSize="1.3em" textAlign="center">
          {subText}
        </Text>
      </Modal.Content>

      <Modal.Footer>
        <Button text={cancelText} icon={cancelIcon} color={cancelColor} onClick={handleCancel} />

        <Button
          text={confirmText}
          icon={confirmIcon}
          color={confirmColor}
          onClick={handleConfirm}
        />
      </Modal.Footer>
    </Modal.Container>
  );
};
