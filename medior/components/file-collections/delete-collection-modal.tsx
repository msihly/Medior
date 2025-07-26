import { Comp, ConfirmModal } from "medior/components";
import { useStores } from "medior/store";

export const DeleteCollectionModal = Comp(() => {
  const stores = useStores();

  const handleConfirmDelete = async () => (await stores.collection.editor.confirmDelete())?.success;

  return (
    <ConfirmModal
      headerText="Delete Collection"
      subText={stores.collection.editor.collection?.title}
      setVisible={stores.collection.setIsConfirmDeleteOpen}
      onConfirm={handleConfirmDelete}
    />
  );
});
