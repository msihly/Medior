import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { AppBar } from "@mui/material";
import { IconButton, IconButtonProps, SortMenu, View } from "components";
import { SelectedFilesInfo } from ".";
import { colors, CONSTANTS, makeClasses } from "utils";
import { toast } from "react-toastify";

export const TopBar = observer(() => {
  const rootStore = useStores();
  const { faceRecognitionStore, fileCollectionStore, fileStore, homeStore } = useStores();
  const { css } = useClasses(null);

  const hasNoSelection = fileStore.selectedIds.length === 0;

  const handleAutoDetect = () =>
    faceRecognitionStore.addFilesToAutoDetectQueue({ fileIds: fileStore.selectedIds, rootStore });

  const handleDelete = () => fileStore.deleteFiles({ fileIds: fileStore.selectedIds, rootStore });

  const handleDeselectAll = () => {
    fileStore.toggleFilesSelected(fileStore.selectedIds.map((id) => ({ id, isSelected: false })));
    toast.info("Deselected all files");
  };

  const handleEditCollections = () => {
    fileCollectionStore.setSelectedFileIds([...fileStore.selectedIds]);
    fileCollectionStore.setIsCollectionManagerOpen(true);
  };

  const handleEditTags = () => {
    homeStore.setTaggerBatchId(null);
    homeStore.setTaggerFileIds([...fileStore.selectedIds]);
    homeStore.setIsTaggerOpen(true);
  };

  const handleFileInfoRefresh = () => fileStore.refreshSelectedFiles({ withThumbs: true });

  const handleSelectAll = () => {
    fileStore.toggleFilesSelected(fileStore.files.map(({ id }) => ({ id, isSelected: true })));
    toast.info(`Added ${fileStore.files.length} files to selection`);
  };

  const handleSortChange = (val: { isDesc: boolean; key: string }) => homeStore.setSortValue(val);

  const handleUnarchive = () =>
    fileStore.deleteFiles({ fileIds: fileStore.selectedIds, isUndelete: true, rootStore });

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
            rows={[
              { label: "Date Modified", attribute: "dateModified", icon: "DateRange" },
              { label: "Date Created", attribute: "dateCreated", icon: "DateRange" },
              { label: "Rating", attribute: "rating", icon: "Star" },
              { label: "Size", attribute: "size", icon: "FormatSize" },
              { label: "Duration", attribute: "duration", icon: "HourglassBottom" },
              { label: "Width", attribute: "width", icon: "Height", iconProps: { rotation: 90 } },
              { label: "Height", attribute: "height", icon: "Height" },
            ]}
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
