import { useEffect } from "react";
import { Button, Card, Comp, ImportEditor, Modal, View } from "medior/components";
import { useImportEditor, useStores } from "medior/store";
import { colors } from "medior/utils/client";

export const Reingester = Comp(() => {
  const stores = useStores();
  const store = stores.import.reingester;
  const options = stores.import.reingester.options;
  const curFolder = store.getCurFolder();

  const { reingest, scan } = useImportEditor(store);

  useEffect(() => {
    if (store.isInitDone) scan();
  }, [store.isInitDone]);

  return (
    <Modal.Container isLoading={store.isDisabled} width="100%" height="100%">
      <ImportEditor.Header type="Reingester" />

      <Modal.Content row column={false} flex={1} height="100%" width="100%">
        <Card width="17rem" overflow="hidden auto">
          <ImportEditor.ImportOptions {...{ scan, store }} />
        </Card>

        <View column width="100%" spacing="0.5rem" overflow="hidden">
          <ImportEditor.TagSelector {...{ options, store }} />

          <Card column flex={1}>
            {curFolder && <ImportEditor.ImportFolderList folder={curFolder} />}
          </Card>
        </View>
      </Modal.Content>

      <Modal.Footer>
        <ImportEditor.CancelButton store={store} />

        <Button
          text="Reingest"
          icon="Check"
          onClick={reingest}
          disabled={store.isDisabled || store.hasChangesSinceLastScan}
          color={colors.custom.blue}
        />
      </Modal.Footer>
    </Modal.Container>
  );
});
