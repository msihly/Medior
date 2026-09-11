import { useEffect, useState } from "react";
import {
  Button,
  Card,
  Comp,
  Icon,
  Modal,
  ProgressBar,
  Text,
  useFileInfo,
  View,
} from "medior/components";
import { useStores } from "medior/store";
import { FileDeletionProgress } from "medior/store/files/file-store";
import { colors, toast } from "medior/utils/client";

export const DeleteFilesModal = Comp(() => {
  const stores = useStores();

  const { loadFileInfo, renderFileInfo } = useFileInfo();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [progress, setProgress] = useState<FileDeletionProgress>({
    message: "Ready to delete files.",
    processedCount: 0,
    totalCount: stores.file.idsForConfirmDelete.length,
  });

  useEffect(() => {
    loadFileInfo();
  }, []);

  const handleDeleteFilesConfirm = async () => {
    setIsDeleting(true);
    const res = await stores.file.deleteFiles(setProgress);
    if (!res.success) {
      toast.error(res.error);
      setIsDeleting(false);
    }
  };

  const handleClose = () => {
    if (isDeleting) {
      stores.file.cancelDeleteFiles();
      setProgress((prev) => ({ ...prev, message: "Stopping deletion..." }));
    } else stores.file.setIsConfirmDeleteOpen(false);
  };

  return (
    <>
      <Modal.Container height="25rem" width="25rem" visible={!isMinimized} onClose={handleClose}>
        <Modal.Header>
          <Text preset="title">{"Delete Files"}</Text>
        </Modal.Header>

        <Modal.Content align="center" justify="center">
          <Icon name="Delete" color={colors.custom.red} size="5rem" />

          <Text fontSize="1.3em" textAlign="center" whiteSpace="normal">
            {isDeleting
              ? progress.message
              : `Are you sure you want to delete these ${stores.file.idsForConfirmDelete.length} files?`}
          </Text>

          {isDeleting ? (
            <ProgressBar
              numerator={progress.processedCount}
              denominator={progress.totalCount}
              viewProps={{ width: "100%" }}
            />
          ) : (
            renderFileInfo()
          )}
        </Modal.Content>

        <Modal.Footer>
          <Button text="Cancel" icon="Close" onClick={handleClose} />

          <Button
            text="Minimize"
            icon="IndeterminateCheckBox"
            onClick={() => setIsMinimized(true)}
          />

          <Button
            text="Delete"
            icon="Delete"
            color={colors.custom.red}
            onClick={handleDeleteFilesConfirm}
            disabled={isDeleting}
          />
        </Modal.Footer>
      </Modal.Container>

      {isMinimized && (
        <View
          position="fixed"
          style={{ bottom: "1rem", right: "1rem", zIndex: 1400 }}
          width="22rem"
        >
          <Card spacing="0.5rem" padding={{ all: "0.5rem" }} width="100%">
            <Text whiteSpace="normal">{progress.message}</Text>

            <ProgressBar numerator={progress.processedCount} denominator={progress.totalCount} />

            <Button text="Restore" icon="OpenInFull" onClick={() => setIsMinimized(false)} />
          </Card>
        </View>
      )}
    </>
  );
});
