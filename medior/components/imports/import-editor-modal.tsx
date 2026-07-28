import {
  Button,
  Card,
  Comp,
  ImportEditor,
  LoadingOverlay,
  Modal,
  ProgressBar,
  Text,
  View,
} from "medior/components";
import { Ingester, Reingester } from "medior/store";
import { colors } from "medior/utils/client";
import { Fmt } from "medior/utils/common";

export interface ImportEditorModalProps {
  loadingLabel: string;
  onSubmit: () => Promise<void>;
  scan: () => Promise<void>;
  store: Ingester | Reingester;
  submitText: string;
  type: "Ingester" | "Reingester";
}

export const ImportEditorModal = Comp(
  ({ loadingLabel, onSubmit, scan, store, submitText, type }: ImportEditorModalProps) => {
    const progressTotal = store.initProgressTotal;
    const status = store.initProgressStatus || store.saveStatus || loadingLabel;

    return (
      <Modal.Container width="100%" height="100%">
        <LoadingOverlay
          isLoading={store.isLoading || store.isSaving}
          sub={
            <View column align="center" spacing="1rem" width="min(28rem, 80vw)">
              <Text preset="title">{status}</Text>

              {progressTotal > 0 && (
                <ProgressBar
                  numerator={store.initProgressCompleted}
                  denominator={progressTotal}
                  numeratorFormatter={Fmt.commas}
                  denominatorFormatter={Fmt.commas}
                  withText
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

        <ImportEditor.Header type={type} />

        <Modal.Content row column={false} flex={1} height="100%" width="100%">
          <Card width="17rem" overflow="hidden auto">
            <ImportEditor.ImportOptions {...{ scan, store }} />
          </Card>

          <View column width="100%" spacing="0.5rem" overflow="hidden">
            <ImportEditor.TagSelector options={store.options} store={store} />

            <ImportEditor.ImportFoldersList store={store} />
          </View>
        </Modal.Content>

        <Modal.Footer>
          <ImportEditor.CancelButton store={store} />

          <Button
            text={submitText}
            icon="Check"
            onClick={onSubmit}
            disabled={store.isDisabled || store.hasChangesSinceLastScan}
            color={colors.custom.blue}
          />
        </Modal.Footer>
      </Modal.Container>
    );
  },
);
