import { useEffect, useState } from "react";
import { Button, Card, Comp, Icon, Modal, Text, useFileInfo, View } from "medior/components";
import { useStores } from "medior/store";
import { FileDeletionProgress } from "medior/store/files/file-store";
import { colors, makeClasses, toast } from "medior/utils/client";

export const DeleteFilesModal = Comp(() => {
  const stores = useStores();
  const store = stores.file;

  const { css } = useClasses(null);

  const { loadFileInfo, renderFileInfo } = useFileInfo();

  const [isDeleting, setIsDeleting] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [progress, setProgress] = useState<FileDeletionProgress>({
    message: "Ready to delete files.",
    processedCount: 0,
    totalCount: store.idsForConfirmDelete.length,
  });

  useEffect(() => {
    loadFileInfo(store.idsForConfirmDelete);
  }, []);

  const handleDeleteFilesConfirm = async () => {
    setIsDeleting(true);

    const res = await store.deleteFiles(setProgress);

    if (!res.success) {
      toast.error(res.error);
      setIsDeleting(false);
    }
  };

  const handleClose = () => {
    if (isDeleting) {
      store.cancelDeleteFiles();
      setProgress((prev) => ({ ...prev, message: "Stopping deletion..." }));
    } else store.setIsConfirmDeleteOpen(false);
  };

  return (
    <>
      <Modal.Container height="25rem" width="25rem" visible={!isMinimized} onClose={handleClose}>
        <Modal.Header>
          <Text preset="title">{"Delete Files"}</Text>
        </Modal.Header>

        <Modal.Content align="center" height="auto" justify="center">
          <Icon name="Delete" color={colors.custom.red} size="5rem" />

          <Text fontSize="1.3em" textAlign="center" whiteSpace="normal">
            {isDeleting
              ? progress.message
              : `Are you sure you want to delete these ${store.idsForConfirmDelete.length} files?`}
          </Text>

          {!isDeleting && renderFileInfo()}
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
        <View position="fixed" className={css.minimized} width="22rem">
          <Card spacing="0.5rem" padding={{ all: "0.5rem" }} width="100%">
            <Text textAlign="center" whiteSpace="normal">
              {progress.message}
            </Text>

            <Button text="Restore" icon="OpenInFull" onClick={() => setIsMinimized(false)} />
          </Card>
        </View>
      )}
    </>
  );
});

const useClasses = makeClasses({
  minimized: {
    bottom: "1rem",
    right: "1rem",
    zIndex: 1400,
  },
});
