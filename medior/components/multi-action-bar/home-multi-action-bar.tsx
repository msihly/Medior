import { AppBar } from "@mui/material";
import { Chip, FileFilterMenu, View } from "medior/components";
import { observer, useStores } from "medior/store";
import { colors, makeClasses, toast } from "medior/utils/client";
import { CONSTANTS } from "medior/utils/common";
import { MultiActionButton, SelectedFilesInfo } from ".";

export const HomeMultiActionBar = observer(() => {
  const stores = useStores();
  const { css } = useClasses(null);

  const hasNoSelection = stores.file.search.selectedIds.length === 0;

  const handleAutoDetect = () =>
    stores.faceRecog.addFilesToAutoDetectQueue(stores.file.search.selectedIds);

  const handleDelete = () => stores.file.confirmDeleteFiles(stores.file.search.selectedIds);

  const handleDeselectAll = () => {
    stores.file.search.toggleSelected(
      stores.file.search.selectedIds.map((id) => ({ id, isSelected: false }))
    );
    toast.info("Deselected all files");
  };

  const handleEditCollections = () => {
    stores.collection.manager.setSelectedFileIds([...stores.file.search.selectedIds]);
    stores.collection.manager.setIsOpen(true);
  };

  const handleEditTags = () => {
    stores.tag.setFileTagEditorBatchId(null);
    stores.tag.setFileTagEditorFileIds([...stores.file.search.selectedIds]);
    stores.tag.setIsFileTagEditorOpen(true);
  };

  const handleFileInfoRefresh = () =>
    stores.file.refreshFiles({ ids: stores.file.search.selectedIds });

  const handleRemux = () =>
    stores.file.refreshFiles({ ids: stores.file.search.selectedIds, remuxOnly: true });

  const handleSelectAll = () => {
    stores.file.search.toggleSelected(
      stores.file.search.results.map(({ id }) => ({ id, isSelected: true }))
    );
    toast.info(`Added ${stores.file.search.results.length} files to selection`);
  };

  const handleUnarchive = () =>
    stores.file.unarchiveFiles({ fileIds: stores.file.search.selectedIds });

  const toggleFileCardFit = () =>
    stores.home.setFileCardFit(stores.home.fileCardFit === "cover" ? "contain" : "cover");

  return (
    <AppBar position="static" className={css.appBar}>
      <View className={css.container}>
        <View row align="center" spacing="0.5rem">
          <View row width="10rem">
            <FileFilterMenu store={stores.file.search} />
          </View>

          {stores.file.search.isArchiveOpen && (
            <Chip label="Archived" bgColor={colors.custom.red} />
          )}

          {stores.file.search.selectedIds.length > 0 && <SelectedFilesInfo />}
        </View>

        <View row align="center" spacing="0.5rem">
          {stores.file.search.isArchived && (
            <MultiActionButton
              name="Delete"
              tooltip="Delete"
              iconProps={{ color: colors.custom.red }}
              onClick={handleDelete}
              disabled={hasNoSelection}
            />
          )}

          <MultiActionButton
            name={stores.file.search.isArchived ? "Unarchive" : "Archive"}
            tooltip={stores.file.search.isArchived ? "Unarchive" : "Archive"}
            onClick={stores.file.search.isArchived ? handleUnarchive : handleDelete}
            disabled={hasNoSelection}
          />

          <MultiActionButton
            name="SwitchVideo"
            tooltip="Remux Videos"
            onClick={handleRemux}
            disabled={hasNoSelection}
          />

          <MultiActionButton
            name="Refresh"
            tooltip="Refresh File Info"
            onClick={handleFileInfoRefresh}
            disabled={hasNoSelection}
          />

          <MultiActionButton
            name="Face"
            tooltip="Auto Detect Faces"
            onClick={handleAutoDetect}
            disabled={hasNoSelection}
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
            name={stores.home.fileCardFit === "cover" ? "Fullscreen" : "FullscreenExit"}
            tooltip={
              stores.home.fileCardFit === "cover"
                ? "Thumbnail Fit (Cover)"
                : "Thumbnail Fit (Contain)"
            }
            onClick={toggleFileCardFit}
          />
        </View>
      </View>
    </AppBar>
  );
});

const useClasses = makeClasses({
  appBar: {
    display: "flex",
    flexFlow: "row nowrap",
    flexGrow: 1,
    flexShrink: 0,
    boxShadow: "rgb(0 0 0 / 50%) 2px 2px 4px 0px",
    zIndex: 5,
  },
  container: {
    display: "flex",
    flexGrow: 1,
    flexShrink: 0,
    justifyContent: "space-between",
    height: CONSTANTS.HOME.TOP_BAR.HEIGHT,
    padding: "0.3rem 0.5rem",
    background: colors.background,
  },
});
