import { useEffect, useState } from "react";
import { Button, Comp, Icon, LoadingOverlay, Modal, Text } from "medior/components";
import { useStores } from "medior/store";
import { colors, toast, useCancellableLoad } from "medior/utils/client";
import { trpc } from "medior/utils/server";

export const DeleteCollectionModal = Comp(() => {
  const stores = useStores();
  const store = stores.collection;

  const load = useCancellableLoad();

  const [fileIds, setFileIds] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isReady, setIsReady] = useState(false);

  const collectionCount = store.idsForConfirmDelete.length;
  const isLoading = isDeleting || load.isLoading;

  useEffect(() => {
    load.run(async (signal) => {
      const collRes = await trpc.listFileCollection.mutate(
        { args: { filter: { id: store.idsForConfirmDelete } } },
        { signal },
      );

      signal.throwIfAborted();

      if (!collRes.success) throw new Error(collRes.error);

      setFileIds([
        ...new Set(
          collRes.data.items.flatMap((c) => c.fileIdIndexes.map((f) => f.fileId.toString())),
        ),
      ]);
      setIsReady(true);
    });
  }, []);

  const handleClose = () => {
    if (!isDeleting) {
      load.cancel();
      store.setIsConfirmDeleteOpen(false);
    }
  };

  const handleDelete = async (withFiles: boolean) => {
    try {
      setIsDeleting(true);

      if (withFiles) {
        const archiveRes = await stores.file.archiveFiles(fileIds);

        if (!archiveRes.success) throw new Error(archiveRes.error);
      }

      const res = await store.deleteCollections(store.idsForConfirmDelete);

      if (!res.success) throw new Error(res.error);

      toast.success("Collection deleted");

      store.editor.setIsOpen(false);
      store.manager.search.loadFiltered();
      store.setIsConfirmDeleteOpen(false);

      return true;
    } catch (err) {
      toast.error(err);

      return false;
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Modal.Container height="auto" width="32rem" onClose={handleClose}>
      <Modal.Header>
        <Text preset="title">{`Delete Collection${collectionCount === 1 ? "" : "s"}`}</Text>
      </Modal.Header>

      <Modal.Content align="center" height="auto" justify="center" spacing="0.75rem">
        <LoadingOverlay
          isLoading={isLoading}
          sub={!isDeleting && <Button text="Cancel" icon="Close" onClick={handleClose} />}
        />

        <Icon name="Delete" color={colors.custom.red} size="4rem" />

        <Text fontSize="1.2em" textAlign="center" whiteSpace="normal">
          {`Delete ${collectionCount} collection${collectionCount === 1 ? "" : "s"} containing ${fileIds.length} file${fileIds.length === 1 ? "" : "s"}?`}
        </Text>

        <Text color={colors.custom.lightGrey} textAlign="center" whiteSpace="normal">
          {
            '"Delete" keeps the files. "Delete with Files" archives the contained files before deleting the collection.'
          }
        </Text>
      </Modal.Content>

      <Modal.Footer>
        <Button text="Cancel" icon="Close" onClick={handleClose} disabled={isDeleting} />

        <Button
          text="Delete"
          icon="Delete"
          onClick={() => handleDelete(false)}
          disabled={isLoading || !isReady}
          color={colors.custom.red}
        />

        <Button
          text="Delete with Files"
          icon="Archive"
          onClick={() => handleDelete(true)}
          disabled={isLoading || !isReady}
          color={colors.custom.orange}
        />
      </Modal.Footer>
    </Modal.Container>
  );
});
