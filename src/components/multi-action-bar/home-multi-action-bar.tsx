import { observer, useStores } from "src/store";
import { AppBar } from "@mui/material";
import { View } from "src/components";
import { MultiActionButton, SelectedFilesInfo } from ".";
import { colors, CONSTANTS, makeClasses } from "src/utils";
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
    stores.collection.setManagerFileIds([...stores.file.selectedIds]);
    stores.collection.setIsManagerOpen(true);
  };

  const handleEditTags = () => {
    stores.tag.setFileTagEditorBatchId(null);
    stores.tag.setFileTagEditorFileIds([...stores.file.selectedIds]);
    stores.tag.setIsFileTagEditorOpen(true);
  };

  const handleFileInfoRefresh = () => stores.file.refreshSelectedFiles();

  const handleSelectAll = () => {
    stores.file.toggleFilesSelected(stores.file.files.map(({ id }) => ({ id, isSelected: true })));
    toast.info(`Added ${stores.file.files.length} files to selection`);
  };

  const handleUnarchive = () => stores.file.unarchiveFiles({ fileIds: stores.file.selectedIds });

  const toggleDrawerOpen = () => stores.home.setIsDrawerOpen(!stores.home.isDrawerOpen);

  const toggleFileCardFit = () =>
    stores.home.setFileCardFit(stores.home.fileCardFit === "cover" ? "contain" : "cover");

  return (
    <AppBar position="static" className={css.appBar}>
      <View className={css.container}>
        <View className={css.divisions}>
          <MultiActionButton name="Menu" onClick={toggleDrawerOpen} />

          {stores.file.selectedIds.length > 0 && <SelectedFilesInfo />}
        </View>

        <View className={css.divisions}>
          {stores.home.isArchiveOpen && (
            <MultiActionButton
              name="Delete"
              tooltip="Delete"
              iconProps={{ color: colors.button.red }}
              onClick={handleDelete}
              disabled={hasNoSelection}
            />
          )}

          <MultiActionButton
            name={stores.home.isArchiveOpen ? "Unarchive" : "Archive"}
            tooltip={stores.home.isArchiveOpen ? "Unarchive" : "Archive"}
            onClick={stores.home.isArchiveOpen ? handleUnarchive : handleDelete}
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
    background: colors.grey["900"],
  },
  divisions: {
    display: "inline-flex",
    alignItems: "center",
    "& > *:not(:last-child)": {
      marginRight: "0.5rem",
    },
  },
});
