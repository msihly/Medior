import { observer, useStores } from "medior/store";
import { FileCollectionEditor, FileCollectionManager } from "medior/components";

export const CollectionModals = observer(() => {
  const stores = useStores();

  return (
    <>
      {stores.collection.isManagerOpen && <FileCollectionManager />}

      {stores.collection.isEditorOpen && <FileCollectionEditor />}
    </>
  );
});
