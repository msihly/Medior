import { useEffect, useState } from "react";
import { colors, toast } from "trabecula/utils/client";
import { Button, Chip, Comp, LoadingOverlay, Modal, Text, View } from "medior/components";
import { useStores } from "medior/store";
import { trpc } from "medior/utils/server";

export const DeleteCollectionModal = Comp(() => {
  const stores = useStores();
  const store = stores.collection;

  const [fileIds, setFileIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const collRes = await trpc.listFileCollection.mutate({
          args: { filter: { id: store.idsForConfirmDelete } },
        });
        if (!collRes.success) throw new Error(collRes.error);

        setFileIds([
          ...new Set(
            collRes.data.items.flatMap((c) => c.fileIdIndexes.map((f) => f.fileId.toString())),
          ),
        ]);
      } catch (err) {
        toast.error(err);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const handleDelete = async (withFiles: boolean) => {
    try {
      setIsLoading(true);
      if (withFiles) {
        const archiveRes = await stores.file.archiveFiles(fileIds);
        if (!archiveRes.success) throw new Error(archiveRes.error);
      }

      const res = await stores.collection.deleteCollections(store.idsForConfirmDelete);
      if (!res.success) throw new Error(res.error);
      toast.success("Collection deleted");

      stores.collection.editor.setIsOpen(false);
      store.manager.search.loadFiltered();
      store.setIsConfirmDeleteOpen(false);
      return true;
    } catch (err) {
      toast.error(err);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal.Container
      height="auto"
      width="22rem"
      onClose={() => store.setIsConfirmDeleteOpen(false)}
    >
      <Modal.Header>
        <Text preset="title">{"Delete Collections"}</Text>
      </Modal.Header>

      <Modal.Content>
        <LoadingOverlay isLoading={isLoading} />

        <View column justify="center" align="center" width="10rem" spacing="0.5rem">
          <Chip
            label={`${store.idsForConfirmDelete.length} Collections`}
            color={colors.custom.white}
            bgColor={colors.custom.red}
            width="100%"
          />

          <Chip
            label={`${fileIds.length} Files`}
            color={colors.custom.white}
            bgColor={colors.custom.orange}
            width="100%"
          />
        </View>
      </Modal.Content>

      <Modal.Footer>
        <Button
          text="Cancel"
          icon="Close"
          onClick={() => store.setIsConfirmDeleteOpen(false)}
          disabled={isLoading}
        />

        <Button
          text="Delete"
          icon="Delete"
          onClick={() => handleDelete(false)}
          disabled={isLoading}
          color={colors.custom.red}
        />

        <Button
          text="Delete with Files"
          icon="Archive"
          onClick={() => handleDelete(true)}
          disabled={isLoading}
          color={colors.custom.orange}
        />
      </Modal.Footer>
    </Modal.Container>
  );
});
