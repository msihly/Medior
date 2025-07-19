import { Comp, ConfirmModal } from "medior/components";
import { useStores } from "medior/store";

export const DeleteCollectionModal = Comp(() => {
  const stores = useStores();

  const handleConfirmDelete = async () => (await stores.collection.editor.confirmDelete())?.success;

  const setVisible = (val: boolean) => stores.collection.setIsConfirmDeleteOpen(val);

  return (
    <ConfirmModal
      headerText="Delete Collection"
      subText={stores.collection.editor.collection?.title}
      setVisible={setVisible}
      onConfirm={handleConfirmDelete}
    />
  );
});
