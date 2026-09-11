import { Comp } from "medior/components";
import { useImportEditor, useStores } from "medior/store";
import { ImportEditorModal } from "./import-editor-modal";

export const Reingester = Comp(() => {
  const store = useStores().import.reingester;
  const { reingest, scan } = useImportEditor(store);

  return (
    <ImportEditorModal
      loadingLabel="Preparing re-import"
      onSubmit={reingest}
      scan={scan}
      store={store}
      submitText="Reingest"
      type="Reingester"
    />
  );
});
