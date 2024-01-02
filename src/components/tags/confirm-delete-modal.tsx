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

  const { fileStore, importStore, tagStore } = useStores();

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
    <Modal.Container onClose={handleClose}>
      <Modal.Header className={css.title}>
        <Text>{"Confirm Delete"}</Text>
      </Modal.Header>

      <Modal.Content>
        <View column align="center">
          <Text className={css.tagLabel}>{tagStore.activeTag?.label}</Text>

          <Icon name="Delete" color={colors.error} size="5rem" />

          <Text className={css.subText}>
            <Text color={colors.error}>{fileStore.listByTagId(tagStore.activeTagId)?.length}</Text>
            {" files will be affected."}
          </Text>

          <Text className={css.subText}>
            <Text color={colors.error}>
              {tagStore.listByParentId(tagStore.activeTagId)?.length}
            </Text>
            {" child tags will be affected."}
          </Text>

          <Text className={css.subText}>
            <Text color={colors.error}>
              {importStore.listByTagId(tagStore.activeTagId)?.length}
            </Text>
            {" import batches will be affected."}
          </Text>
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
  subText: {
    margin: "0.5rem 0",
    color: colors.grey["400"],
    textAlign: "center",
  },
  tagLabel: {
    color: colors.error,
    fontWeight: 500,
    fontSize: "1.5em",
    textAlign: "center",
  },
});
