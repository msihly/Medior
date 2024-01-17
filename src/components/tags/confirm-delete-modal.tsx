import { Dispatch, SetStateAction } from "react";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { Button, Icon, Modal, Text, View } from "components";
import { colors, makeClasses } from "utils";
import { toast } from "react-toastify";

interface ConfirmDeleteModalProps {
  setVisible: Dispatch<SetStateAction<boolean>>;
}

export const ConfirmDeleteModal = observer(({ setVisible }: ConfirmDeleteModalProps) => {
  const { css } = useClasses(null);

  const { tagStore } = useStores();

  const tag = tagStore.getById(tagStore.activeTagId);

  const handleClose = () => setVisible(false);

  const handleDelete = async () => {
    const res = await tagStore.deleteTag({ id: tagStore.activeTagId });
    if (!res.success) toast.error("Failed to delete tag");
    else {
      toast.success("Tag deleted");
      handleClose();
      tagStore.setIsTagEditorOpen(false);
    }
  };

  return (
    <Modal.Container
      onClose={handleClose}
      height="100%"
      width="100%"
      maxHeight="15rem"
      maxWidth="20rem"
    >
      <Modal.Header className={css.title}>
        <Text>{"Confirm Delete"}</Text>
      </Modal.Header>

      <Modal.Content>
        <View column align="center">
          <Icon name="Delete" color={colors.error} size="5rem" />

          <Text className={css.tagLabel}>{tag?.label}</Text>
        </View>
      </Modal.Content>

      <Modal.Footer>
        <Button text="Cancel" icon="Close" onClick={handleClose} color={colors.grey["700"]} />

        <Button text="Delete" icon="Delete" onClick={handleDelete} color={colors.error} />
      </Modal.Footer>
    </Modal.Container>
  );
});

const useClasses = makeClasses({
  title: {
    margin: 0,
    padding: "0.5rem 0",
    color: colors.grey["400"],
    fontSize: "1.3em",
    textAlign: "center",
  },
  tagLabel: {
    fontWeight: 500,
    fontSize: "1.5em",
    textAlign: "center",
  },
});
