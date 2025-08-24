import {
  Comp,
  ConfirmModal,
  FaceRecognitionModal,
  InfoModal,
  VideoTransformerModal,
} from "medior/components";
import { useStores } from "medior/store";

export const FileModals = Comp(() => {
  const stores = useStores();

  const handleDeleteFilesConfirm = async () => (await stores.file.deleteFiles()).success;

  const setDeleteFilesModalVisible = (val: boolean) => stores.file.setIsConfirmDeleteOpen(val);

  return (
    <>
      {stores.faceRecog.isModalOpen && <FaceRecognitionModal />}

      {stores.file.isInfoModalOpen && <InfoModal />}

      {stores.file.videoTransformer.isOpen && <VideoTransformerModal />}

      {stores.file.isConfirmDeleteOpen && (
        <ConfirmModal
          headerText="Delete Files"
          subText={`Are you sure you want to delete these ${stores.file.idsForConfirmDelete.length} files?`}
          setVisible={setDeleteFilesModalVisible}
          onConfirm={handleDeleteFilesConfirm}
        />
      )}
    </>
  );
});
