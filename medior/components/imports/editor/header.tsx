import { Chip, Comp, Modal, Text, View } from "medior/components";
import { useStores } from "medior/store";
import { Fmt } from "medior/utils/common";

export const Header = Comp(() => {
  const stores = useStores();
  const store = stores.import.editor;

  return (
    <Modal.Header
      rightNode={
        <View row spacing="0.3rem">
          {store.savedConfigFolderPaths.length > 0 && (
            <Chip label={`${Fmt.commas(store.savedConfigFolderPaths.length)} Configs Left`} />
          )}

          <Chip label={Fmt.bytes(store.importSize)} />

          <Chip label={`${Fmt.commas(store.folderTotalCount)} Folders`} />

          <Chip label={`${Fmt.commas(store.importCount)} Files`} />
        </View>
      }
    >
      <Text preset="title">{store.mode === "reingest" ? "Reingester" : "Ingester"}</Text>
    </Modal.Header>
  );
});
