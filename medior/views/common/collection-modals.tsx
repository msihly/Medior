import {
  Comp,
  DeleteCollectionModal,
  FileCollectionEditor,
  FileCollectionManager,
} from "medior/components";
import { useStores } from "medior/store";

export const CollectionModals = Comp(() => {
  const stores = useStores();

  return (
    <>
      {stores.collection.manager.isOpen && <FileCollectionManager />}

      {stores.collection.editor.isOpen && <FileCollectionEditor />}

      {stores.collection.isConfirmDeleteOpen && <DeleteCollectionModal />}
    </>
  );
});
