import {
  Comp,
  DeleteMediaProgramModal,
  MediaProgramEditor,
  MediaProgramManager,
} from "medior/components";
import { useStores } from "medior/store";

export const MediaProgramModals = Comp(() => {
  const stores = useStores();
  const store = stores.mediaProgram;

  return (
    <>
      {store.manager.isOpen && <MediaProgramManager />}

      {store.editor.isOpen && <MediaProgramEditor />}

      {store.isConfirmDeleteOpen && <DeleteMediaProgramModal />}
    </>
  );
});
