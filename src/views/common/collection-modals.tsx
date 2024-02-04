import { useStores } from "store";
import { observer } from "mobx-react-lite";
import { FileCollectionEditor, FileCollectionManager } from "components";

export const CollectionModals = observer(() => {
  const { fileCollectionStore } = useStores();

  return (
    <>
      {fileCollectionStore.isCollectionManagerOpen && <FileCollectionManager />}

      {fileCollectionStore.isCollectionEditorOpen && <FileCollectionEditor />}
    </>
  );
});
