import { useEffect } from "react";
import {
  Button,
  Comp,
  Icon,
  JobProgress,
  JobStopButton,
  Modal,
  SelectedFilesInfo,
  Text,
  useFileInfo,
} from "medior/components";
import { useStores } from "medior/store";
import { colors, toast } from "medior/utils/client";

export const DeleteFilesModal = Comp(() => {
  const stores = useStores();
  const store = stores.file;

  const { fileInfo, loadFileInfo } = useFileInfo();

  useEffect(() => {
    loadFileInfo(store.idsForConfirmDelete);
  }, []);

  const handleDeleteFilesConfirm = async () => {
    const res = await store.deleteFiles();

    if (!res.success) toast.error(res.error);
  };

  /** Deletion keeps going in the background while the modal is hidden. */
  const handleClose = () => {
    if (store.actionJobId) handleMinimize();
    else store.setIsConfirmDeleteOpen(false);
  };

  const handleMinimize = () => store.setIsActionMinimized(true);

  return (
    <Modal.Container
      height="25rem"
      width="25rem"
      visible={!store.isActionMinimized}
      onClose={handleClose}
    >
      <Modal.Header>
        <Text preset="title">{"Delete Files"}</Text>
      </Modal.Header>

      <Modal.Content align="center" height="auto" justify="center">
        {store.actionJob ? (
          <JobProgress job={store.actionJob} embedded />
        ) : (
          <>
            <Icon name="Delete" color={colors.custom.red} size="5rem" />

            <Text fontSize="1.3em" textAlign="center" whiteSpace="normal">
              {`Are you sure you want to delete these ${store.idsForConfirmDelete.length} files?`}
            </Text>

            <SelectedFilesInfo {...fileInfo} />
          </>
        )}
      </Modal.Content>

      <Modal.Footer>
        {store.actionJob ? (
          <>
            <JobStopButton job={store.actionJob} />

            <Button text="Minimize" icon="IndeterminateCheckBox" onClick={handleMinimize} />
          </>
        ) : (
          <>
            <Button
              text="Cancel"
              icon="Close"
              onClick={handleClose}
              disabled={!!store.actionJobId}
            />

            <Button
              text="Delete"
              icon="Delete"
              color={colors.custom.red}
              onClick={handleDeleteFilesConfirm}
              disabled={store.isActionRunning}
            />
          </>
        )}
      </Modal.Footer>
    </Modal.Container>
  );
});
