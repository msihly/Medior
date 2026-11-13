import { useState } from "react";
import { Button, Comp, Icon, LoadingOverlay, Modal, Text } from "medior/components";
import { useStores } from "medior/store";
import { colors, toast } from "medior/utils/client";

export const DeleteMediaProgramModal = Comp(() => {
  const stores = useStores();
  const store = stores.mediaProgram;

  const [isDeleting, setIsDeleting] = useState(false);

  const count = store.idsForConfirmDelete.length;

  const handleClose = () => {
    if (!isDeleting) store.setIsConfirmDeleteOpen(false);
  };

  const handleDelete = async () => {
    setIsDeleting(true);

    try {
      const res = await store.deleteMediaPrograms([...store.idsForConfirmDelete]);
      if (!res.success) throw new Error(res.error);

      store.setIsConfirmDeleteOpen(false);
    } catch (error) {
      toast.error(error);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Modal.Container height="auto" width="32rem" onClose={handleClose}>
      <Modal.Header>
        <Text preset="title">{`Delete Media Program${count === 1 ? "" : "s"}`}</Text>
      </Modal.Header>

      <Modal.Content align="center" height="auto" justify="center" spacing="0.75rem">
        <LoadingOverlay isLoading={isDeleting} />

        <Icon name="Delete" color={colors.custom.red} size="4rem" />

        <Text fontSize="1.2em" textAlign="center" whiteSpace="normal">
          {`Delete ${count} media program${count === 1 ? "" : "s"}?`}
        </Text>

        <Text color={colors.custom.lightGrey} textAlign="center" whiteSpace="normal">
          {"Episode files stay in your library, along with any collections holding them."}
        </Text>
      </Modal.Content>

      <Modal.Footer>
        <Button text="Cancel" icon="Close" onClick={handleClose} disabled={isDeleting} />

        <Button
          text="Delete"
          icon="Delete"
          onClick={handleDelete}
          disabled={isDeleting}
          color={colors.custom.red}
        />
      </Modal.Footer>
    </Modal.Container>
  );
});
