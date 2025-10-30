import {
  Comp,
  DeleteFilesModal,
  FaceRecognitionModal,
  InfoModal,
  VideoTransformerModal,
} from "medior/components";
import { useStores } from "medior/store";

export const FileModals = Comp(() => {
  const stores = useStores();

  return (
    <>
      {stores.faceRecog.isModalOpen && <FaceRecognitionModal />}

      {stores.file.isInfoModalOpen && <InfoModal />}

      {stores.file.videoTransformer.isOpen && <VideoTransformerModal />}

      {stores.file.isConfirmDeleteOpen && <DeleteFilesModal />}
    </>
  );
});
