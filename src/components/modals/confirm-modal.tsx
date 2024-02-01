import { Dispatch, SetStateAction } from "react";
import { Button, Icon, IconName, Modal, Text, View } from "components";
import { colors, makeClasses } from "utils";

export interface ConfirmModalProps {
  cancelColor?: string;
  cancelIcon?: IconName;
  cancelText?: string;
  confirmColor?: string;
  confirmIcon?: IconName;
  confirmText?: string;
  headerText?: string;
  onCancel?: () => void;
  onConfirm: () => Promise<boolean>;
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
    const success = await onConfirm();
    if (success) handleClose();
  };

  return (
    <Modal.Container
      onClose={handleCancel}
      height="100%"
      width="100%"
      maxHeight="15rem"
      maxWidth="20rem"
    >
      <Modal.Header className={css.title}>
        <Text>{headerText}</Text>
      </Modal.Header>

      <Modal.Content>
        <View column align="center">
          <Icon name="Delete" color={colors.error} size="5rem" />

          <Text className={css.subText}>{subText}</Text>
        </View>
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
  subText: {
    fontWeight: 500,
    fontSize: "1.5em",
    textAlign: "center",
  },
  title: {
    margin: 0,
    padding: "0.5rem 0",
    color: colors.grey["400"],
    fontSize: "1.3em",
    textAlign: "center",
  },
});
