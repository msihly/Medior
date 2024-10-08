import { observer, useStores } from "medior/store";
import { ConfirmModal, FaceRecognitionModal, InfoModal } from "medior/components";

export const FileModals = observer(() => {
  const stores = useStores();

  const handleDeleteFilesConfirm = async () => (await stores.file.deleteFiles()).success;

  const setDeleteFilesModalVisible = (val: boolean) => stores.file.setIsConfirmDeleteOpen(val);

  return (
    <>
      {stores.faceRecog.isModalOpen && <FaceRecognitionModal />}

      {stores.file.isInfoModalOpen && <InfoModal />}

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
