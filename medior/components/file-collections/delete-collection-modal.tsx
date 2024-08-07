import { observer, useStores } from "medior/store";
import { ConfirmModal } from "medior/components";

export const DeleteCollectionModal = observer(() => {
  const stores = useStores();

  const handleConfirmDelete = async () => (await stores.collection.confirmDelete())?.success;

  const handleDelete = () => stores.collection.setIsConfirmDeleteOpen(true);

  return (
    stores.collection.isConfirmDeleteOpen && (
      <ConfirmModal
        headerText="Delete Collection"
        subText={stores.collection.activeCollection?.title}
        setVisible={handleDelete}
        onConfirm={handleConfirmDelete}
      />
    )
  );
});
