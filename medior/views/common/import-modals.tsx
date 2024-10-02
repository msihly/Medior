import { observer, useStores } from "medior/store";
import { ImportEditor, ImportManager } from "medior/components";

export const ImportModals = observer(() => {
  const stores = useStores();

  return (
    <>
      <ImportManager />

      {stores.import.editor.isOpen && <ImportEditor />}
    </>
  );
});
