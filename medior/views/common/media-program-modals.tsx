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

  return (
    <>
      {store.editor.isOpen && <MediaProgramEditor />}

      {store.metaMatchProgram && (
        <MediaProgramMetaModal
          program={store.metaMatchProgram}
          season={store.metaMatchSeason}
          onClose={store.closeMetaMatch}
        />
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
