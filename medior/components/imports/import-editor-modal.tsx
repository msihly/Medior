import { useState } from "react";
import {
  Button,
  Card,
  Chip,
  Comp,
  ImportEditor,
  LoadingOverlay,
  Modal,
  SavedImportConfigsModal,
  Text,
  View,
} from "medior/components";
import { useImportEditor, useStores } from "medior/store";
import { colors } from "medior/utils/client";
import { Fmt } from "medior/utils/common";

/** The Ingester, which imports new files or, as the Reingester, imports library files again. */
export const ImportEditorModal = Comp(() => {
  const stores = useStores();
  const store = stores.import.editor;

  const [isConfigsModalOpen, setIsConfigsModalOpen] = useState(false);

  const { ingest, reingest, scan } = useImportEditor(store);

  const isReingest = store.mode === "reingest";
  const progressTotal = store.initProgressTotal;
  const status =
    store.initProgressStatus ||
    store.saveStatus ||
    (isReingest ? "Preparing re-import" : "Preparing import");

  return (
    <>
      <Modal.Container width="100%" height="100%">
        <LoadingOverlay
          isLoading={store.isLoading || store.isSaving}
          sub={
            <View column align="center" spacing="1rem" width="28rem">
              <Text preset="title">{status}</Text>

              {progressTotal > 0 && (
                <Chip
                  label={Fmt.commas(store.initProgressCompleted)}
                  denominator={Fmt.commas(progressTotal)}
                />
              )}

              <Button
                text="Cancel"
                icon="Delete"
                onClick={store.cancelInit}
                colorOnHover={colors.custom.red}
              />
            </View>
          }
        />

        <ImportEditor.Header />

        <Modal.Content row>
          <Card width="17rem" overflow="hidden auto">
            <ImportEditor.ImportOptions {...{ scan, store }} />
          </Card>

          <View column width="100%" spacing="0.5rem" overflow="hidden">
            <ImportEditor.TagSelector options={store.options} store={store} />

            {store.mediaPrograms.length > 0 && <ImportEditor.MediaProgramPlans store={store} />}

            <ImportEditor.ImportFoldersList store={store} />
          </View>
        </Modal.Content>

        <Modal.Footer>
          <ImportEditor.CancelButton store={store} />

          <Button
            text="Saved Configs"
            icon="Settings"
            onClick={() => setIsConfigsModalOpen(true)}
          />

          <Button
            text={isReingest ? "Reingest" : "Ingest"}
            icon="Check"
            onClick={isReingest ? reingest : ingest}
            disabled={
              store.isDisabled ||
              store.hasChangesSinceLastScan ||
              store.mediaPrograms.some((plan) => !plan.name.trim())
            }
            color={colors.custom.blue}
          />
        </Modal.Footer>
      </Modal.Container>

      {isConfigsModalOpen && (
        <SavedImportConfigsModal store={store} onClose={() => setIsConfigsModalOpen(false)} />
      )}
    </>
  );
});
