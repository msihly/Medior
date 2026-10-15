import {
  Button,
  Comp,
  DeleteFilesModal,
  FaceRecognitionModal,
  FileExportModal,
  FileRefreshModal,
  InfoModal,
  JobProgress,
  LoadingOverlay,
  LowerResolutionModal,
  Modal,
  SimilarityModal,
  Text,
  VideoTransformerModal,
  View,
} from "medior/components";
import { useStores } from "medior/store";

export const FileModals = Comp(() => {
  const stores = useStores();
  const store = stores.file;

  /** Preparation is cancelled; a running job keeps going in the background. */
  const handleActionClose = () => {
    if (store.isActionPreparing) store.cancelActionPreparation();
    else handleActionMinimize();
  };

  const handleActionMinimize = () => store.setIsActionMinimized(true);

  return (
    <>
      {stores.faceRecog.isModalOpen && <FaceRecognitionModal />}

      {stores.faceRecog.isPreparingAutoDetect && (
        <Modal.Container
          onClose={stores.faceRecog.cancelAutoDetectPreparation}
          width="30rem"
          height="16rem"
        >
          <LoadingOverlay
            isLoading
            sub={
              <View column align="center" spacing="1rem">
                <Text>{"Preparing face detection..."}</Text>

                <Button
                  text="Cancel"
                  icon="Close"
                  onClick={stores.faceRecog.cancelAutoDetectPreparation}
                />
              </View>
            }
          />
        </Modal.Container>
      )}

      {store.isInfoModalOpen && <InfoModal />}

      {store.isRefreshOpen && <FileRefreshModal />}

      {store.similarity.isOpen && <SimilarityModal />}

      {store.lowerResolution.isOpen && <LowerResolutionModal />}

      {store.videoTransformer.isOpen && <VideoTransformerModal />}

      {store.isConfirmDeleteOpen && <DeleteFilesModal />}

      {store.exporter.isOpen && <FileExportModal />}

      {store.isActionRunning && !store.isConfirmDeleteOpen && (
        <Modal.Container
          visible={!store.isActionMinimized}
          onClose={handleActionClose}
          width="30rem"
          height="20rem"
        >
          <LoadingOverlay
            isLoading
            sub={
              store.isActionPreparing ? (
                <View column align="center" spacing="1rem">
                  <Text>{"Preparing files…"}</Text>

                  <Button text="Cancel" icon="Close" onClick={store.cancelActionPreparation} />
                </View>
              ) : (
                store.actionJob && (
                  <JobProgress job={store.actionJob} onMinimize={handleActionMinimize} />
                )
              )
            }
          />
        </Modal.Container>
      )}
    </>
  );
});
