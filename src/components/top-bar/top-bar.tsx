import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { AppBar } from "@mui/material";
import { IconButton, IconButtonProps, SortMenu, SortMenuProps, View } from "components";
import { SelectedFilesInfo } from ".";
import { colors, CONSTANTS, makeClasses } from "utils";
import { toast } from "react-toastify";

export const TopBar = observer(() => {
  const rootStore = useStores();
  const { faceRecognitionStore, fileCollectionStore, fileStore, homeStore, tagStore } = useStores();
  const { css } = useClasses(null);

  const hasNoSelection = fileStore.selectedIds.length === 0;

  const handleAutoDetect = () =>
    faceRecognitionStore.addFilesToAutoDetectQueue({ fileIds: fileStore.selectedIds, rootStore });

  const handleDelete = () => fileStore.confirmDeleteFiles(fileStore.selectedIds);

  const handleDeselectAll = () => {
    fileStore.toggleFilesSelected(fileStore.selectedIds.map((id) => ({ id, isSelected: false })));
    toast.info("Deselected all files");
  };

  const handleEditCollections = () => {
    fileCollectionStore.setManagerFileIds([...fileStore.selectedIds]);
    fileCollectionStore.setIsManagerOpen(true);
  };

  const handleEditTags = () => {
    tagStore.setTaggerBatchId(null);
    tagStore.setTaggerFileIds([...fileStore.selectedIds]);
    tagStore.setIsTaggerOpen(true);
  };

  const handleFileInfoRefresh = () => fileStore.refreshSelectedFiles();

  const handleSelectAll = () => {
    fileStore.toggleFilesSelected(fileStore.files.map(({ id }) => ({ id, isSelected: true })));
    toast.info(`Added ${fileStore.files.length} files to selection`);
  };

  const handleSortChange = (val: SortMenuProps["value"]) => {
    homeStore.setSortValue(val);
    homeStore.loadFilteredFiles({ page: 1 });
  };

  const handleUnarchive = () => fileStore.unarchiveFiles({ fileIds: fileStore.selectedIds });

  const toggleDrawerOpen = () => homeStore.setIsDrawerOpen(!homeStore.isDrawerOpen);

  const toggleFileCardFit = () =>
    homeStore.setFileCardFit(homeStore.fileCardFit === "cover" ? "contain" : "cover");

  return (
    <AppBar position="static" className={css.appBar}>
      <View className={css.container}>
        <View className={css.divisions}>
          <TopIconButton name="Menu" onClick={toggleDrawerOpen} />

          {fileStore.selectedIds.length > 0 && <SelectedFilesInfo />}
        </View>

        <View className={css.divisions}>
          {homeStore.isArchiveOpen && (
            <TopIconButton
              name="Delete"
              tooltip="Delete"
              iconProps={{ color: colors.button.red }}
              onClick={handleDelete}
              disabled={hasNoSelection}
            />
          )}

          <TopIconButton
            name={homeStore.isArchiveOpen ? "Unarchive" : "Archive"}
            tooltip={homeStore.isArchiveOpen ? "Unarchive" : "Archive"}
            onClick={homeStore.isArchiveOpen ? handleUnarchive : handleDelete}
            disabled={hasNoSelection}
          />

          <TopIconButton
            name="Refresh"
            tooltip="Refresh File Info"
            onClick={handleFileInfoRefresh}
            disabled={hasNoSelection}
          />

          <TopIconButton
            name="Face"
            tooltip="Auto Detect Faces"
            onClick={handleAutoDetect}
            disabled={hasNoSelection}
          />

          <TopIconButton
            name="Collections"
            tooltip="Edit Collections"
            onClick={handleEditCollections}
            disabled={hasNoSelection}
          />

          <TopIconButton
            name="Label"
            tooltip="Edit Tags"
            onClick={handleEditTags}
            disabled={hasNoSelection}
          />

          <TopIconButton
            name="Deselect"
            tooltip="Deselect All Files"
            onClick={handleDeselectAll}
            disabled={hasNoSelection}
          />

          <TopIconButton
            name="SelectAll"
            tooltip="Select All Files in View"
            onClick={handleSelectAll}
          />

          <TopIconButton
            name={homeStore.fileCardFit === "cover" ? "Fullscreen" : "FullscreenExit"}
            tooltip={
              homeStore.fileCardFit === "cover"
                ? "Thumbnail Fit (Cover)"
                : "Thumbnail Fit (Contain)"
            }
            onClick={toggleFileCardFit}
          />

          <SortMenu
            rows={CONSTANTS.SORT_MENU_OPTS.FILE_SEARCH}
            value={homeStore.sortValue}
            setValue={handleSortChange}
          />
        </View>
      </View>
    </AppBar>
  );
});

interface TopIconButtonProps extends IconButtonProps {}

const TopIconButton = ({ tooltipProps = {}, ...props }: TopIconButtonProps) => {
  return (
    <IconButton {...props} size="medium" tooltipProps={{ placement: "bottom", ...tooltipProps }} />
  );
};

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
