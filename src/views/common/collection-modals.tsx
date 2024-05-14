import { useStores } from "store";
import { observer } from "mobx-react-lite";
import { FileCollectionEditor, FileCollectionManager } from "components";

export const CollectionModals = observer(() => {
  const stores = useStores();

  return (
    <>
      {stores.collection.isManagerOpen && <FileCollectionManager />}

      {stores.collection.isEditorOpen && <FileCollectionEditor />}
    </>
  );
});
