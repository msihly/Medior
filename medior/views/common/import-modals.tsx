import { Comp, ImportEditor, ImportManager } from "medior/components";
import { useStores } from "medior/store";

export const ImportModals = Comp(() => {
  const stores = useStores();

  return (
    <>
      <ImportManager />

      {stores.import.editor.isOpen && <ImportEditor />}
    </>
  );
});
