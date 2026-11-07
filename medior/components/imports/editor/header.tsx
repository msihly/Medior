import { Button, Chip, Comp, Modal, Text, View } from "medior/components";
import { useStores } from "medior/store";
import { Fmt } from "medior/utils/common";

export interface HeaderProps {
  type: "Ingester" | "Reingester";
}

export const Header = Comp(({ type }: HeaderProps) => {
  const stores = useStores();
  const store = stores.import;

  const editor = type === "Ingester" ? store.ingester : store.reingester;

  const handleTagManager = () => {
    if (stores.tag.manager.isOpen) stores.tag.manager.setIsOpen(false);

    setTimeout(() => stores.tag.manager.setIsOpen(true), 0);
  };

  return (
    <Modal.Header
      leftNode={<Button text="Tag Manager" icon="Label" onClick={handleTagManager} />}
      rightNode={
        <View row spacing="0.3rem">
          {type === "Ingester" && store.ingester.savedConfigFolderPaths.length > 0 && (
            <Chip
              label={`${Fmt.commas(store.ingester.savedConfigFolderPaths.length)} Configs Left`}
            />
          )}

          <Chip label={Fmt.bytes(editor.importSize)} />

          <Chip label={`${Fmt.commas(editor.folderTotalCount)} Folders`} />

          <Chip label={`${Fmt.commas(editor.importCount)} Files`} />
        </View>
      }
    >
      <Text preset="title">{type === "Ingester" ? "Ingester" : "Reingester"}</Text>
    </Modal.Header>
  );
});
