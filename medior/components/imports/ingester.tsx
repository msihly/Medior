import { Comp } from "medior/components";
import { useImportEditor, useStores } from "medior/store";
import { ImportEditorModal } from "./import-editor-modal";

export const Ingester = Comp(() => {
  const store = useStores().import.ingester;
  const { ingest, scan } = useImportEditor(store);

  return (
    <ImportEditorModal
      loadingLabel="Preparing import"
      onSubmit={ingest}
      scan={scan}
      store={store}
      submitText="Ingest"
      type="Ingester"
    />
  );
});
