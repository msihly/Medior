import { useContext, useState } from "react";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { deleteFiles, FileInfoRefreshQueue, refreshFile } from "database";
import { AppBar, colors } from "@mui/material";
import { HomeContext } from "views";
import { IconButton, Tagger, View } from "components";
import { SortMenu } from ".";
import { makeClasses } from "utils";
import { toast } from "react-toastify";

const TopBar = observer(() => {
  const context = useContext(HomeContext);
  const { appStore, fileStore, tagStore } = useStores();
  const { classes: css } = useClasses(null);

  const [isCollectionEditorOpen, setIsCollectionEditorOpen] = useState(false);

  const handleDelete = () => deleteFiles(fileStore, fileStore.selected);

  const handleEditCollections = () => setIsCollectionEditorOpen(true);

  const handleEditTags = () => tagStore.setIsTaggerOpen(true);

  const handleFileInfoRefresh = () => {
    fileStore.selected.map((f) => FileInfoRefreshQueue.add(() => refreshFile(fileStore, f.id)));
    toast.info(`Refreshing ${fileStore.selected?.length} files' info...`);
  };

  const handleDeselectAll = () => {
    fileStore.toggleFilesSelected(
      fileStore.selected.map((f) => f.id),
      false
    );

    toast.info("Deselected all files");
  };

  const handleSelectAll = () => {
    fileStore.toggleFilesSelected(
      context.displayedFiles.map((f) => f.id),
      true
    );

    toast.info(
      `Added ${context.displayedFiles.length} files to selection (${fileStore.selected.length})`
    );
  };

  const handleUnarchive = () => deleteFiles(fileStore, fileStore.selected, true);

  return (
    <AppBar position="relative" className={css.appBar}>
      <View className={css.container}>
        <span className={css.divisions}>
          {!appStore.isDrawerOpen && (
            <IconButton name="Menu" onClick={() => appStore.setIsDrawerOpen(true)} size="medium" />
          )}
        </span>

        <span className={css.divisions}>
          {context?.isArchiveOpen && (
            <IconButton
              name="Delete"
              onClick={handleDelete}
              disabled={fileStore.selected.length === 0}
              size="medium"
            />
          )}

          <IconButton
            name={context?.isArchiveOpen ? "Unarchive" : "Archive"}
            onClick={context?.isArchiveOpen ? handleUnarchive : handleDelete}
            disabled={fileStore.selected.length === 0}
            size="medium"
          />

          <IconButton
            name="Refresh"
            onClick={handleFileInfoRefresh}
            disabled={fileStore.selected.length === 0}
            size="medium"
          />

          <IconButton
            name="Collections"
            onClick={handleEditCollections}
            disabled={fileStore.selected.length === 0}
            size="medium"
          />

          <IconButton
            name="Label"
            onClick={handleEditTags}
            disabled={fileStore.selected.length === 0}
            size="medium"
          />

          <IconButton
            name="Deselect"
            onClick={handleDeselectAll}
            disabled={fileStore.selected.length === 0}
            size="medium"
          />

          <IconButton name="SelectAll" onClick={handleSelectAll} size="medium" />

          <SortMenu />
        </span>
      </View>

      {tagStore.isTaggerOpen && <Tagger files={fileStore.selected} />}
    </AppBar>
  );
});

export default TopBar;

const useClasses = makeClasses({
  appBar: {
    display: "flex",
    flexFlow: "row nowrap",
    backgroundColor: colors.grey["900"],
  },
  container: {
    display: "flex",
    flex: 1,
    justifyContent: "space-between",
    padding: "0.3rem 0.5rem",
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
