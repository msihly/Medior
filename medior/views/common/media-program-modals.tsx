import {
  Comp,
  DeleteMediaProgramModal,
  MediaProgramEditor,
  MediaProgramManager,
  MediaProgramMetaModal,
} from "medior/components";
import { useStores } from "medior/store";

export const MediaProgramModals = Comp(() => {
  const stores = useStores();
  const store = stores.mediaProgram;

  const handleMetaMatchClose = () => store.setMetaMatchProgramId(null);

  return (
    <>
      {store.manager.isOpen && <MediaProgramManager />}

      {store.editor.isOpen && <MediaProgramEditor />}

      {store.metaMatchProgram && (
        <MediaProgramMetaModal program={store.metaMatchProgram} onClose={handleMetaMatchClose} />
      )}

      {store.isConfirmDeleteOpen && <DeleteMediaProgramModal />}
    </>
  );
});
