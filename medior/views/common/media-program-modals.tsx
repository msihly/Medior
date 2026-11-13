import {
  Comp,
  DeleteMediaProgramModal,
  MediaProgramEditor,
  MediaProgramMetaModal,
  MediaProgramTitleTranslationModal,
  ModalGroupContext,
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

      {/* A translation's progress shows over every view until it's minimized to the corner. */}
      {store.titleTranslation.isOpen && (
        <ModalGroupContext.Provider value={undefined}>
          <MediaProgramTitleTranslationModal />
        </ModalGroupContext.Provider>
      )}
    </>
  );
});
