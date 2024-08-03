import { Dispatch, SetStateAction } from "react";
import { Button, Icon, IconName, Modal, Text } from "medior/components";
import { colors, makeClasses } from "medior/utils";

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
  cancelColor = colors.button.grey,
  cancelIcon = "Close",
  cancelText = "Cancel",
  confirmColor = colors.button.red,
  confirmIcon = "Delete",
  confirmText = "Delete",
  headerText = "Confirm Delete",
  onCancel,
  onConfirm,
  setVisible,
  subText,
}: ConfirmModalProps) => {
  const { css } = useClasses(null);

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
      <Modal.Header className={css.modalHeader}>
        <Text color={colors.grey["400"]} fontSize="1.1em" fontWeight={500}>
          {headerText}
        </Text>
      </Modal.Header>

      <Modal.Content className={css.modalContent}>
        <Icon name="Delete" color={colors.error} size="5rem" />

        <Text color={colors.grey["300"]} fontSize="1.3em" textAlign="center">
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

const useClasses = makeClasses({
  modalContent: {
    justifyContent: "center",
    alignItems: "center",
  },
  modalHeader: {
    margin: 0,
    padding: "0.5rem 0",
  },
});
