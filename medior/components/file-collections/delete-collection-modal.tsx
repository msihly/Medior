import { useEffect, useState } from "react";
import { colors, toast } from "trabecula/utils/client";
import { Checkbox, Chip, Comp, ConfirmModal, LoadingOverlay, View } from "medior/components";
import { useStores } from "medior/store";
import { trpc } from "medior/utils/server";

export const DeleteCollectionModal = Comp(() => {
  const stores = useStores();
  const store = stores.collection;

  const [fileIds, setFileIds] = useState<string[]>([]);
  const [isArchiveFilesChecked, setIsArchiveFilesChecked] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const collRes = await trpc.listFileCollection.mutate({
        args: { filter: { id: store.idsForConfirmDelete } },
      });
      if (!collRes.success) throw new Error(collRes.error);

      const fileIds = [
        ...new Set(
          collRes.data.items.flatMap((c) => c.fileIdIndexes.map((f) => f.fileId.toString())),
        ),
      ];
      setFileIds(fileIds);
    })();
  }, []);

  const handleConfirmDelete = async () => {
    try {
      setIsLoading(true);
      if (isArchiveFilesChecked) {
        const archiveRes = await stores.file.archiveFiles(fileIds);
        if (!archiveRes.success) throw new Error(archiveRes.error);
      }

      const res = await stores.collection.deleteCollections(store.idsForConfirmDelete);
      if (!res.success) throw new Error(res.error);
      setIsLoading(false);
      toast.success("Collection deleted");

      stores.collection.editor.setIsOpen(false);
      store.manager.search.loadFiltered();
      return true;
    } catch (err) {
      setIsLoading(false);
      toast.error(err);
      return false;
    }
  };

  return (
    <ConfirmModal
      headerText="Delete Collections"
      onConfirm={handleConfirmDelete}
      setVisible={store.setIsConfirmDeleteOpen}
    >
      <LoadingOverlay isLoading={isLoading} />

      <View column align="center" width="8rem" spacing="0.5rem">
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

        <Checkbox
          label="Archive files"
          checked={isArchiveFilesChecked}
          setChecked={setIsArchiveFilesChecked}
          color={colors.custom.orange}
        />
      </View>
    </ConfirmModal>
  );
});
