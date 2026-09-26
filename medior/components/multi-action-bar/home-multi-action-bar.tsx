import { useState } from "react";
import { AppBar } from "@mui/material";
import { SortValue } from "medior/store/_generated";
import { Chip, Comp, FileFilter, MultiActionButton, View } from "medior/components";
import { handleReingest, useStores } from "medior/store";
import { colors, makeClasses, toast } from "medior/utils/client";
import { CONSTANTS } from "medior/utils/common";
import { SelectedFilesInfo, SelectFilesModal } from ".";

interface HomeMultiActionBarProps {
  isHome?: boolean;
}

export const HomeMultiActionBar = Comp(({ isHome = false }: HomeMultiActionBarProps) => {
  const stores = useStores();
  const store = stores.file.search;
  const { css } = useClasses(null);

  const [isSelectModalOpen, setIsSelectModalOpen] = useState(false);

  const selectedIds = [...store.selectedIds];
  const hasNoSelection = selectedIds.length === 0;

  const sourceSortValue =
    (store.cachedFilterProps as { sortValue?: SortValue })?.sortValue ?? store.sortValue;

  const handleAutoDetect = () => stores.faceRecog.addFilesToAutoDetectQueue(selectedIds);

  const handleDelete = () => stores.file.confirmDeleteFiles(selectedIds);

  const handleDeselectAll = () => {
    store.toggleSelected(selectedIds.map((id) => ({ id, isSelected: false })));
    toast.info("Deselected all files");
  };

  const handleEditCollections = () => {
    stores.collection.manager.setSelectedFileIds(selectedIds);
    stores.collection.manager.setIsOpen(true);
  };

  const handleEditTags = () => {
    stores.file.tagsEditor.setBatchId(null);
    stores.file.tagsEditor.setFileIds(selectedIds);
    stores.file.tagsEditor.setIsOpen(true);
  };

  const handleFileInfoRefresh = () => stores.file.refreshFiles({ ids: selectedIds });

  const handleReencode = () =>
    stores.file.openVideoTransformer(selectedIds, "reencode", sourceSortValue);

  const handleRemux = () => stores.file.openVideoTransformer(selectedIds, "remux", sourceSortValue);

  const handleSelectAll = () => {
    store.toggleSelected(store.results.map(({ id }) => ({ id, isSelected: true })));
    toast.info(`Added ${store.results.length} files to selection`);
  };

  const handleSelectAllInQuery = async () => {
    const res = await store.selectAllInQuery();
    if (!res.success) toast.error("Failed to select all files");
    else toast.info(`Selected ${res.data} files`);
  };

  const handleUnarchive = () => stores.file.unarchiveFiles({ fileIds: selectedIds });

  const reingest = () => handleReingest({ fileIds: selectedIds, store: stores.import.reingester });

  return (
    <>
      <AppBar position="static" className={css.appBar}>
        <View className={css.container}>
          <View row align="center" spacing="0.5rem">
            <FileFilter.Menu store={store} />

            {store.isArchiveOpen && <Chip label="Archived" bgColor={colors.custom.red} />}

            {store.selectedIds.length > 0 && <SelectedFilesInfo />}
          </View>

          <View row align="center" spacing="0.5rem">
            {store.isArchived && (
              <MultiActionButton
                name="Delete"
                tooltip="Delete"
                iconProps={{ color: colors.custom.red }}
                onClick={handleDelete}
                disabled={hasNoSelection}
              />
            )}

            <MultiActionButton
              name={store.isArchived ? "Unarchive" : "Archive"}
              tooltip={store.isArchived ? "Unarchive" : "Archive"}
              onClick={store.isArchived ? handleUnarchive : handleDelete}
              disabled={hasNoSelection}
            />

            <MultiActionButton
              name="AutoMode"
              iconProps={{ size: "0.85em" }}
              tooltip="Re-encode Media"
              onClick={handleReencode}
              disabled={hasNoSelection || !isHome}
            />

            <MultiActionButton
              name="RotateRight"
              iconProps={{ rotation: 240, size: "1.1em" }}
              tooltip="Remux Videos"
              onClick={handleRemux}
              disabled={hasNoSelection || !isHome}
            />

            <MultiActionButton
              name="Refresh"
              iconProps={{ rotation: 190, size: "1.1em" }}
              tooltip="Refresh File Info"
              onClick={handleFileInfoRefresh}
              disabled={hasNoSelection}
            />

            <MultiActionButton
              name="GetApp"
              tooltip="Reingest"
              onClick={reingest}
              disabled={hasNoSelection || !isHome}
            />

            <MultiActionButton
              name="Face"
              tooltip="Auto Detect Faces"
              onClick={handleAutoDetect}
              disabled={hasNoSelection || !isHome}
            />

            <MultiActionButton
              name="Collections"
              tooltip="Edit Collections"
              onClick={handleEditCollections}
              disabled={hasNoSelection}
            />

            <MultiActionButton
              name="Label"
              tooltip="Edit Tags"
              onClick={handleEditTags}
              disabled={hasNoSelection}
            />

            <MultiActionButton
              name="Deselect"
              tooltip="Deselect All Files"
              onClick={handleDeselectAll}
              disabled={hasNoSelection}
            />

            <MultiActionButton
              name="SelectAll"
              tooltip="Select All Files in View"
              onClick={handleSelectAll}
            />

            <MultiActionButton
              name="Checklist"
              tooltip="Select First Files in Query"
              onClick={() => setIsSelectModalOpen(true)}
            />

            <MultiActionButton
              name="LibraryAddCheck"
              tooltip="Select All Files in Query"
              onClick={handleSelectAllInQuery}
            />
          </View>
        </View>
      </AppBar>

      {isSelectModalOpen && <SelectFilesModal onClose={() => setIsSelectModalOpen(false)} />}
    </>
  );
});

const useClasses = makeClasses({
  appBar: {
    boxShadow: "rgb(0 0 0 / 50%) 2px 2px 4px 0px",
    display: "flex",
    flexFlow: "row nowrap",
    flexGrow: 0,
    flexShrink: 0,
    zIndex: 5,
  },
  container: {
    background: colors.background,
    display: "flex",
    flexGrow: 1,
    flexShrink: 0,
    height: CONSTANTS.HOME.TOP_BAR.HEIGHT,
    justifyContent: "space-between",
    padding: "0.3rem 0.5rem",
  },
});
