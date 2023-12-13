import { Dispatch, SetStateAction, useState } from "react";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { Button, Icon, Input, Modal, Text, View } from "components";
import { colors, makeClasses } from "utils";
import { toast } from "react-toastify";

interface ConfirmDeleteModalProps {
  setVisible: Dispatch<SetStateAction<boolean>>;
}

export const ConfirmDeleteModal = observer(({ setVisible }: ConfirmDeleteModalProps) => {
  const { css } = useClasses(null);

  const { fileCollectionStore } = useStores();

  const title = fileCollectionStore.activeCollection?.title;

  const [confirmValue, setConfirmValue] = useState("");

  const handleClose = () => setVisible(false);

  const handleDelete = async () => {
    const res = await fileCollectionStore.deleteCollection(fileCollectionStore.activeCollectionId);
    if (!res.success) toast.error("Failed to delete collection");
    else {
      handleClose();
      fileCollectionStore.setActiveCollectionId(null);
      fileCollectionStore.setIsCollectionEditorOpen(false);
      toast.success("Collection deleted");
    }
  };

  return (
    <Modal.Container onClose={handleClose}>
      <Modal.Header className={css.modalTitle}>{"Delete Collection"}</Modal.Header>

      <Modal.Content>
        <View column align="center">
          <Text className={css.title}>{title}</Text>

          <Icon name="Delete" color={colors.red["900"]} size="5rem" />

          <Input
            placeholder={`Enter "${title}"`}
            value={confirmValue}
            setValue={setConfirmValue}
            color={colors.red["800"]}
            textAlign="center"
            width="100%"
          />
        </View>
      </Modal.Content>

      <Modal.Footer>
        <Button text="Cancel" icon="Close" onClick={handleClose} color={colors.grey["700"]} />

        <Button
          text="Delete"
          icon="Delete"
          onClick={handleDelete}
          disabled={confirmValue !== title}
          color={colors.red["800"]}
        />
      </Modal.Footer>
    </Modal.Container>
  );
});

const useClasses = makeClasses({
  modalTitle: {
    margin: 0,
    padding: "0.5rem 0",
    color: colors.grey["400"],
    fontSize: "1.3em",
    textAlign: "center",
  },
  title: {
    color: colors.red["800"],
    fontWeight: 500,
    fontSize: "1.5em",
    textAlign: "center",
  },
});
