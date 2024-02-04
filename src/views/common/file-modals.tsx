import { useStores } from "store";
import { observer } from "mobx-react-lite";
import { ConfirmModal, FaceRecognitionModal, InfoModal } from "components";

export const FileModals = observer(() => {
  const rootStore = useStores();
  const { faceRecognitionStore, fileStore } = useStores();

  const handleDeleteFilesConfirm = async () => (await fileStore.deleteFiles({ rootStore })).success;

  const setDeleteFilesModalVisible = (val: boolean) => fileStore.setIsConfirmDeleteOpen(val);

  return (
    <>
      {faceRecognitionStore.isModalOpen && <FaceRecognitionModal />}

      {fileStore.isInfoModalOpen && <InfoModal />}

      {fileStore.isConfirmDeleteOpen && (
        <ConfirmModal
          headerText="Delete Files"
          subText="Are you sure you want to delete these files?"
          setVisible={setDeleteFilesModalVisible}
          onConfirm={handleDeleteFilesConfirm}
        />
      )}
    </>
  );
});
