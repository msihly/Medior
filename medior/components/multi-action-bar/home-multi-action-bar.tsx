import { observer, useStores } from "medior/store";
import { AppBar } from "@mui/material";
import { FileFilterMenu, View } from "medior/components";
import { MultiActionButton, SelectedFilesInfo } from ".";
import { colors, CONSTANTS, makeClasses } from "medior/utils";
import { toast } from "react-toastify";

export const HomeMultiActionBar = observer(() => {
  const stores = useStores();
  const { css } = useClasses(null);

  const hasNoSelection = stores.file.selectedIds.length === 0;

  const handleAutoDetect = () =>
    stores.faceRecog.addFilesToAutoDetectQueue(stores.file.selectedIds);

  const handleDelete = () => stores.file.confirmDeleteFiles(stores.file.selectedIds);

  const handleDeselectAll = () => {
    stores.file.toggleFilesSelected(
      stores.file.selectedIds.map((id) => ({ id, isSelected: false }))
    );
    toast.info("Deselected all files");
  };

  const handleEditCollections = () => {
    stores.collection.manager.setSelectedFileIds([...stores.file.selectedIds]);
    stores.collection.manager.setIsOpen(true);
  };

  const handleEditTags = () => {
    stores.tag.setFileTagEditorBatchId(null);
    stores.tag.setFileTagEditorFileIds([...stores.file.selectedIds]);
    stores.tag.setIsFileTagEditorOpen(true);
  };

  const handleFileInfoRefresh = () => stores.file.refreshSelectedFiles();

  const handleSelectAll = () => {
    stores.file.toggleFilesSelected(
      stores.file.search.results.map(({ id }) => ({ id, isSelected: true }))
    );
    toast.info(`Added ${stores.file.search.results.length} files to selection`);
  };

  const handleUnarchive = () => stores.file.unarchiveFiles({ fileIds: stores.file.selectedIds });

  const toggleFileCardFit = () =>
    stores.home.setFileCardFit(stores.home.fileCardFit === "cover" ? "contain" : "cover");

  return (
    <AppBar position="static" className={css.appBar}>
      <View className={css.container}>
        <View className={css.divisions}>
          <View row width="10rem">
            <FileFilterMenu store={stores.file.search} />
          </View>

          {stores.file.selectedIds.length > 0 && <SelectedFilesInfo />}
        </View>

        <View className={css.divisions}>
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
    height: CONSTANTS.TOP_BAR_HEIGHT,
    padding: "0.3rem 0.5rem",
    background: colors.background,
  },
  divisions: {
    display: "inline-flex",
    alignItems: "center",
    "& > *:not(:last-child)": {
      marginRight: "0.5rem",
    },
  },
});
