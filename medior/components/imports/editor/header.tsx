import { Button, Chip, Comp, Modal, Text, View } from "medior/components";
import { useStores } from "medior/store";
import { Fmt, sumArray } from "medior/utils/common";

export interface HeaderProps {
  type: "Ingester" | "Reingester";
}

export const Header = Comp(({ type }: HeaderProps) => {
  const stores = useStores();
  const store = stores.import;

  const totalBytes = type === "Ingester" ? store.ingester.importSize : null;
  const totalFolders =
    type === "Ingester" ? store.ingester.folderTotalCount : store.reingester.folderFileIds.length;

  const totalFiles =
    type === "Ingester"
      ? store.ingester.importCount
      : sumArray(store.reingester.folderFileIds, (f) => f.fileIds.length);

  const totalFilesLeft =
    type === "Ingester" ? null : totalFiles - (store.reingester.curFolderFileIds?.length ?? 0);

  const handleTagManager = () => {
    if (stores.tag.manager.isOpen) stores.tag.manager.setIsOpen(false);

    setTimeout(() => stores.tag.manager.setIsOpen(true), 0);
  };

  return (
    <Modal.Header
      leftNode={<Button text="Tag Manager" icon="Label" onClick={handleTagManager} />}
      rightNode={
        <View row spacing="0.3rem">
          {type === "Ingester" ? (
            <>
              <Chip label={Fmt.bytes(totalBytes)} />

              <Chip label={`${Fmt.commas(totalFolders)} Folders`} />

              <Chip label={`${Fmt.commas(totalFiles)} Files`} />
            </>
          ) : (
            <>
              <Chip label={`${Fmt.commas(totalFolders - 1)} Folders Left`} />

              <Chip label={`${Fmt.commas(totalFilesLeft)} Files Left`} />
            </>
          )}
        </View>
      }
    >
      <Text preset="title">{type === "Ingester" ? "Ingester" : "Reingester"}</Text>
    </Modal.Header>
  );
});
