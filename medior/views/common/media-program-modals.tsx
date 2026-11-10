import {
  Comp,
  DeleteMediaProgramModal,
  MediaProgramEditor,
  MediaProgramMetaModal,
} from "medior/components";
import { useStores } from "medior/store";

export const MediaProgramModals = Comp(() => {
  const stores = useStores();
  const store = stores.mediaProgram;

  const handleMetaMatchClose = () => store.setMetaMatchProgramId(null);

  return (
    <>
      {store.editor.isOpen && <MediaProgramEditor />}

      {store.metaMatchProgram && (
        <MediaProgramMetaModal program={store.metaMatchProgram} onClose={handleMetaMatchClose} />
      )}

      {store.isConfirmDeleteOpen && <DeleteMediaProgramModal />}
    </>
  );
});
