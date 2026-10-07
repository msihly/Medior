import {
  Comp,
  DeleteCollectionModal,
  FileCollectionEditor,
  FileCollectionManager,
} from "medior/components";
import { useStores } from "medior/store";

export const CollectionModals = Comp(() => {
  const stores = useStores();
  const store = stores.collection;

  return (
    <>
      {store.manager.isOpen && <FileCollectionManager />}

      {store.editor.isOpen && <FileCollectionEditor />}

      {store.isConfirmDeleteOpen && <DeleteCollectionModal />}
    </>
  );
});
