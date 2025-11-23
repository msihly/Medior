import { Button, Chip, Comp, Modal, Text, View } from "medior/components";
import { useStores } from "medior/store";
import { commas, formatBytes, sumArray } from "medior/utils/common";

export interface HeaderProps {
  type: "Ingester" | "Reingester";
}

export const Header = Comp(({ type }: HeaderProps) => {
  const stores = useStores();

  const totalBytes =
    type === "Ingester"
      ? stores.import.ingester.imports.reduce((acc, cur) => acc + cur.size, 0)
      : null;

  const totalFolders =
    type === "Ingester"
      ? stores.import.ingester.flatFolderHierarchy.size
      : stores.import.reingester.folderFileIds.length;

  const totalFiles =
    type === "Ingester"
      ? stores.import.ingester.imports.length
      : sumArray(stores.import.reingester.folderFileIds, (f) => f.fileIds.length);

  const totalFilesLeft =
    type === "Ingester"
      ? null
      : totalFiles - (stores.import.reingester.curFolderFileIds?.length ?? 0);

  const handleTagManager = () => {
    if (stores.tag.manager.isOpen) stores.tag.manager.setIsOpen(false);
    setTimeout(() => stores.tag.manager.setIsOpen(true), 0);
  };

  return (
    <Modal.Header
      leftNode={<Button text="Tag Manager" icon="More" onClick={handleTagManager} />}
      rightNode={
        <View row spacing="0.3rem">
          {type === "Ingester" ? (
            <>
              <Chip label={formatBytes(totalBytes)} />
              <Chip label={`${commas(totalFolders)} Folders`} />
              <Chip label={`${commas(totalFiles)} Files`} />
            </>
          ) : (
            <>
              <Chip label={`${commas(totalFolders - 1)} Folders Left`} />
              <Chip label={`${commas(totalFilesLeft)} Files Left`} />
            </>
          )}
        </View>
      }
    >
      <Text preset="title">{type === "Ingester" ? "Ingester" : "Reingester"}</Text>
    </Modal.Header>
  );
});
