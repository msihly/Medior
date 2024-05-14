import { useStores } from "store";
import { observer } from "mobx-react-lite";
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
