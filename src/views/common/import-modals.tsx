import { observer, useStores } from "store";
import { ImportEditor, ImportManager } from "components";

export const ImportModals = observer(() => {
  const stores = useStores();

  return (
    <>
      <ImportManager />

      {stores.import.isImportEditorOpen && <ImportEditor />}
    </>
  );
});
