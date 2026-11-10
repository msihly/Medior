import { Comp, ImportEditorModal } from "medior/components";
import { useStores } from "medior/store";

export const ImportModals = Comp(() => {
  const stores = useStores();

  return stores.import.editor.isOpen ? <ImportEditorModal /> : null;
});
