import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { AppBar } from "@mui/material";
import { IconButton, SortMenu, SortRow, View } from "components";
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

  const handleIsSortDescChange = (isSortDesc: boolean) => homeStore.setIsSortDesc(isSortDesc);

  const handleSelectAll = () => {
    fileStore.toggleFilesSelected(fileStore.files.map(({ id }) => ({ id, isSelected: true })));
    toast.info(`Added ${fileStore.files.length} files to selection`);
  };

  const handleSortChange = () => homeStore.reloadDisplayedFiles({ rootStore, page: 1 });

  const handleSortKeyChange = (sortKey: string) => homeStore.setSortKey(sortKey);

  const handleUnarchive = () =>
    fileStore.deleteFiles({ fileIds: fileStore.selectedIds, isUndelete: true, rootStore });

  const toggleDrawerOpen = () => homeStore.setIsDrawerOpen(!homeStore.isDrawerOpen);

  const toggleFileCardFit = () =>
    homeStore.setFileCardFit(homeStore.fileCardFit === "cover" ? "contain" : "cover");

  return (
    <AppBar position="static" className={css.appBar}>
      <View className={css.container}>
        <View className={css.divisions}>
          <IconButton name="Menu" onClick={toggleDrawerOpen} size="medium" />

          {fileStore.selectedIds.length > 0 && <SelectedFilesInfo />}
        </View>

        <View className={css.divisions}>
          {homeStore.isArchiveOpen && (
            <IconButton
              name="Delete"
              onClick={handleDelete}
              disabled={hasNoSelection}
              size="medium"
            />
          )}

          <IconButton
            name={homeStore.isArchiveOpen ? "Unarchive" : "Archive"}
            onClick={homeStore.isArchiveOpen ? handleUnarchive : handleDelete}
            disabled={hasNoSelection}
            size="medium"
          />

          <IconButton
            name="Refresh"
            onClick={handleFileInfoRefresh}
            disabled={hasNoSelection}
            size="medium"
          />

          <IconButton
            name="Face"
            onClick={handleAutoDetect}
            disabled={hasNoSelection}
            size="medium"
          />

          <IconButton
            name="Collections"
            onClick={handleEditCollections}
            disabled={hasNoSelection}
            size="medium"
          />

          <IconButton
            name="Label"
            onClick={handleEditTags}
            disabled={hasNoSelection}
            size="medium"
          />

          <IconButton
            name="Deselect"
            onClick={handleDeselectAll}
            disabled={hasNoSelection}
            size="medium"
          />

          <IconButton name="SelectAll" onClick={handleSelectAll} size="medium" />

          <IconButton
            name={homeStore.fileCardFit === "cover" ? "Fullscreen" : "FullscreenExit"}
            onClick={toggleFileCardFit}
            size="medium"
          />

          <SortMenu
            onChange={handleSortChange}
            isSortDesc={homeStore.isSortDesc}
            sortKey={homeStore.sortKey}
            setIsSortDesc={handleIsSortDescChange}
            setSortKey={handleSortKeyChange}
          >
            <SortRow label="Date Modified" attribute="dateModified" icon="DateRange" />
            <SortRow label="Date Created" attribute="dateCreated" icon="DateRange" />
            <SortRow label="Rating" attribute="rating" icon="Star" />
            <SortRow label="Size" attribute="size" icon="FormatSize" />
            <SortRow label="Duration" attribute="duration" icon="HourglassBottom" />
            <SortRow label="Width" attribute="width" icon="Height" iconProps={{ rotation: 90 }} />
            <SortRow label="Height" attribute="height" icon="Height" />
          </SortMenu>
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
    "&:first-of-type > *:not(:last-child)": {
      marginRight: "0.5rem",
    },
    "&:last-of-type > *:not(:first-of-type)": {
      marginLeft: "0.5rem",
    },
  },
});
