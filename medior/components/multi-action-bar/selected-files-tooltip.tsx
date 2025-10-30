import { Chip, Comp, Tooltip, useFileInfo } from "medior/components";
import { useStores } from "medior/store";

export const SelectedFilesInfo = Comp(() => {
  const stores = useStores();

  const { loadFileInfo, renderFileInfo } = useFileInfo();

  return (
    <Tooltip onOpen={loadFileInfo} minWidth="11rem" title={renderFileInfo()}>
      <Chip label={`${stores.file.search.selectedIds.length} Selected`} />
    </Tooltip>
  );
});
