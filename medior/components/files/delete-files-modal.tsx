import { useEffect } from "react";
import { Comp, ConfirmModal, useFileInfo } from "medior/components";
import { useStores } from "medior/store";

export const DeleteFilesModal = Comp(() => {
  const stores = useStores();

  const { loadFileInfo, renderFileInfo } = useFileInfo();

  useEffect(() => {
    loadFileInfo();
  }, []);

  const handleDeleteFilesConfirm = async () => (await stores.file.deleteFiles()).success;

  const setDeleteFilesModalVisible = (val: boolean) => stores.file.setIsConfirmDeleteOpen(val);

  return (
    <ConfirmModal
      headerText="Delete Files"
      subText={`Are you sure you want to delete these ${stores.file.idsForConfirmDelete.length} files?`}
      setVisible={setDeleteFilesModalVisible}
      onConfirm={handleDeleteFilesConfirm}
    >
      {renderFileInfo()}
    </ConfirmModal>
  );
});
