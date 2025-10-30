import { Dispatch, ReactNode, SetStateAction, useState } from "react";
import { Button, Icon, IconName, Modal, Text } from "medior/components";
import { colors, CSS } from "medior/utils/client";

export interface ConfirmModalProps {
  cancelColor?: string;
  cancelIcon?: IconName;
  cancelText?: string;
  children?: ReactNode | ReactNode[];
  confirmColor?: string;
  confirmIcon?: IconName;
  confirmText?: string;
  headerText?: string;
  height?: CSS["height"];
  onCancel?: () => void;
  onConfirm: () => Promise<boolean>;
  setVisible: Dispatch<SetStateAction<boolean>>;
  subText?: string;
  width?: CSS["width"];
}

export const ConfirmModal = ({
  cancelColor = colors.custom.grey,
  cancelIcon = "Close",
  cancelText = "Cancel",
  children,
  confirmColor = colors.custom.red,
  confirmIcon = "Delete",
  confirmText = "Delete",
  headerText = "Confirm Delete",
  height = "25rem",
  onCancel,
  onConfirm,
  setVisible,
  subText,
  width = "25rem",
}: ConfirmModalProps) => {
  const [isLoading, setIsLoading] = useState(false);

  const handleClose = () => setVisible(false);

  const handleCancel = () => {
    onCancel?.();
    handleClose();
  };

  const handleConfirm = async () => {
    setIsLoading(true);
    const success = await onConfirm();
    setIsLoading(false);
    if (success) handleClose();
  };

  return (
    <Modal.Container isLoading={isLoading} onClose={handleCancel} height={height} width={width}>
      <Modal.Header>
        <Text preset="title">{headerText}</Text>
      </Modal.Header>

      <Modal.Content align="center" justify="center">
        <Icon name="Delete" color={colors.custom.red} size="5rem" />

        {subText?.length > 0 ? (
          <Text fontSize="1.3em" textAlign="center">
            {subText}
          </Text>
        ) : null}

        {children}
      </Modal.Content>

      <Modal.Footer>
        <Button
          text={cancelText}
          icon={cancelIcon}
          color={cancelColor}
          onClick={handleCancel}
          disabled={isLoading}
        />

        <Button
          text={confirmText}
          icon={confirmIcon}
          color={confirmColor}
          onClick={handleConfirm}
          disabled={isLoading}
        />
      </Modal.Footer>
    </Modal.Container>
  );
};
