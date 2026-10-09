import { Chip, Comp, Tooltip, useFileInfo } from "medior/components";
import { FileSearch, useStores } from "medior/store";

export const SelectedFilesInfo = Comp(({ store: suppliedStore }: { store?: FileSearch }) => {
  const stores = useStores();
  const store = suppliedStore ?? stores.file.search;

  const { loadFileInfo, renderFileInfo } = useFileInfo();

  const handleOpen = () => loadFileInfo(store.selectedIds);

  return (
    <Tooltip onOpen={handleOpen} minWidth="11rem" title={renderFileInfo()} padding={0}>
      <Chip label={`${store.selectedIds.length} Selected`} />
    </Tooltip>
  );
});
