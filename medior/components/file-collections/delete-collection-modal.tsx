import { observer, useStores } from "medior/store";
import { ConfirmModal } from "medior/components";

export const DeleteCollectionModal = observer(() => {
  const stores = useStores();

  const handleConfirmDelete = async () => (await stores.collection.editor.confirmDelete())?.success;

  const setVisible = (val: boolean) => stores.collection.setIsConfirmDeleteOpen(val);

  return (
    stores.collection.isConfirmDeleteOpen && (
      <ConfirmModal
        headerText="Delete Collection"
        subText={stores.collection.editor.collection?.title}
        setVisible={setVisible}
        onConfirm={handleConfirmDelete}
      />
    )
  );
});
