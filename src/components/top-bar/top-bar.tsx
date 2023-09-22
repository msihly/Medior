import { useState } from "react";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { AppBar, colors } from "@mui/material";
import { IconButton, Tagger, View } from "components";
import { SelectedFilesInfo, SortMenu } from ".";
import { makeClasses } from "utils";
import { toast } from "react-toastify";
import Color from "color";

export const TopBar = observer(() => {
  const rootStore = useStores();
  const { fileStore, homeStore } = useStores();
  const { css } = useClasses(null);

  const hasNoSelection = fileStore.selectedIds.length === 0;

  const [isTaggerOpen, setIsTaggerOpen] = useState(false);

  const handleDelete = () => fileStore.deleteFiles({ rootStore, fileIds: fileStore.selectedIds });

  const handleEditTags = () => setIsTaggerOpen(true);

  const handleFileInfoRefresh = () => fileStore.refreshSelectedFiles({ withThumbs: true });

  const handleDeselectAll = () => {
    fileStore.toggleFilesSelected(fileStore.selectedIds.map((id) => ({ id, isSelected: false })));
    toast.info("Deselected all files");
  };

  const handleSelectAll = () => {
    fileStore.toggleFilesSelected(fileStore.files.map(({ id }) => ({ id, isSelected: true })));
    toast.info(`Added ${fileStore.files.length} files to selection`);
  };

  const handleUnarchive = () =>
    fileStore.deleteFiles({ rootStore, fileIds: fileStore.selectedIds, isUndelete: true });

  const toggleFileCardFit = () =>
    homeStore.setFileCardFit(homeStore.fileCardFit === "cover" ? "contain" : "cover");

  return (
    <AppBar position="relative" className={css.appBar}>
      <View className={css.container}>
        <View className={css.divisions}>
          {!homeStore.isDrawerOpen && (
            <IconButton name="Menu" onClick={() => homeStore.setIsDrawerOpen(true)} size="medium" />
          )}

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

          <SortMenu />
        </View>
      </View>

      {isTaggerOpen && <Tagger fileIds={fileStore.selectedIds} setVisible={setIsTaggerOpen} />}
    </AppBar>
  );
});

const useClasses = makeClasses({
  appBar: {
    display: "flex",
    flexFlow: "row nowrap",
    boxShadow: "rgb(0 0 0 / 50%) 2px 2px 4px 0px",
    zIndex: 5,
  },
  container: {
    display: "flex",
    flex: 1,
    justifyContent: "space-between",
    padding: "0.3rem 0.5rem",
    background: `linear-gradient(to left, ${colors.grey["900"]}, ${Color(colors.grey["900"])
      .darken(0.1)
      .string()})`,
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
