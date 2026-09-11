import {
  Comp,
  DeleteFilesModal,
  FaceRecognitionModal,
  FileRefreshModal,
  InfoModal,
  SimilarityModal,
  VideoTransformerModal,
} from "medior/components";
import { useStores } from "medior/store";

export const FileModals = Comp(() => {
  const stores = useStores();

  return (
    <>
      {stores.faceRecog.isModalOpen && <FaceRecognitionModal />}

      {stores.file.isInfoModalOpen && <InfoModal />}

      {stores.file.isRefreshOpen && <FileRefreshModal />}

      {stores.file.similarity.isOpen && <SimilarityModal />}

      {stores.file.videoTransformer.isOpen && <VideoTransformerModal />}

      {stores.file.isConfirmDeleteOpen && <DeleteFilesModal />}
    </>
  );
});
