import { observer, useStores } from "src/store";
import { ImportEditor, ImportManager } from "src/components";

export const ImportModals = observer(() => {
  const stores = useStores();

  return (
    <>
      <ImportManager />

      {stores.import.isImportEditorOpen && <ImportEditor />}
    </>
  );
});
