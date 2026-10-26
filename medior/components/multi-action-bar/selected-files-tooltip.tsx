import { Chip, Comp, SelectedFilesInfo, Tooltip, useFileInfo } from "medior/components";
import { FileSearch, useStores } from "medior/store";

export const SelectedFilesTooltip = Comp(({ store: suppliedStore }: { store?: FileSearch }) => {
  const stores = useStores();
  const store = suppliedStore ?? stores.file.search;

  const { fileInfo, loadFileInfo } = useFileInfo();

  const handleOpen = () => loadFileInfo(store.selectedIds);

  return (
    <Tooltip
      onOpen={handleOpen}
      minWidth="11rem"
      title={<SelectedFilesInfo {...fileInfo} />}
      padding={0}
    >
      <Chip label={`${store.selectedIds.length} Selected`} />
    </Tooltip>
  );
});
