import {
  Button,
  Comp,
  DeleteFilesModal,
  FaceRecognitionModal,
  FileRefreshModal,
  InfoModal,
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

      {store.isActionRunning && (
        <Modal.Container onClose={store.cancelFileAction} width="30rem" height="16rem">
          <LoadingOverlay
            isLoading
            sub={
              <View column align="center" spacing="1rem" padding={{ all: "1rem" }}>
                <Text>{store.actionMessage}</Text>

                <Button
                  text={store.isActionCancelling ? "Stopping after current operation…" : "Cancel"}
                  icon="Close"
                  onClick={store.cancelFileAction}
                  disabled={store.isActionCancelling}
                />
              </View>
            }
          />
        </Modal.Container>
      )}
    </>
  );
});
