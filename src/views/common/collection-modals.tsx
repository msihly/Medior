import { useStores } from "store";
import { observer } from "mobx-react-lite";
import { FileCollectionEditor, FileCollectionManager } from "components";

export const CollectionModals = observer(() => {
  const { fileCollectionStore } = useStores();

  return (
    <>
      {fileCollectionStore.isManagerOpen && <FileCollectionManager />}

      {fileCollectionStore.isEditorOpen && <FileCollectionEditor />}
    </>
  );
});
