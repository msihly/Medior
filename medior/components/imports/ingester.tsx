import { Button, Card, Comp, Modal, View } from "medior/components";
import { ImportEditor } from "medior/components/imports/editor";
import { useImportEditor, useStores } from "medior/store";
import { colors } from "medior/utils/client";

export const Ingester = Comp(() => {
  const stores = useStores();
  const store = stores.import.ingester;
  const options = stores.import.ingester.options;

  const { ingest, scan } = useImportEditor(store);

  return (
    <Modal.Container isLoading={store.isDisabled} width="100%" height="100%">
      <ImportEditor.Header type="Ingester" />

      <Modal.Content row column={false} flex={1} height="100%" width="100%">
        <Card width="17rem" overflow="hidden auto">
          <ImportEditor.ImportOptions {...{ scan, store }} />
        </Card>

        <View column width="100%" spacing="0.5rem" overflow="hidden">
          <ImportEditor.TagSelector {...{ options, store }} />

          <ImportEditor.ImportFoldersList store={store} />
        </View>
      </Modal.Content>

      <Modal.Footer>
        <ImportEditor.CancelButton store={store} />

        <Button
          text="Ingest"
          icon="Check"
          onClick={ingest}
          disabled={store.isDisabled || store.hasChangesSinceLastScan}
          color={colors.custom.blue}
        />
      </Modal.Footer>
    </Modal.Container>
  );
});
