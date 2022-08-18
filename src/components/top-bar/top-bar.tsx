import { useState } from "react";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { deleteFiles } from "database";
import { AppBar, colors } from "@mui/material";
import { IconButton, ImportsProgress, Tagger, View } from "components";
import { SortMenu } from ".";
import { makeClasses } from "utils";
import { toast } from "react-toastify";

const TopBar = observer(() => {
  const { appStore, fileStore } = useStores();
  const { classes: css } = useClasses(null);

  const [isTaggerOpen, setIsTaggerOpen] = useState(false);
  const [isCollectionEditorOpen, setIsCollectionEditorOpen] = useState(false);

  const handleDelete = () => deleteFiles(fileStore, fileStore.selected);

  const handleEditCollections = () => setIsCollectionEditorOpen(true);

  const handleEditTags = () => setIsTaggerOpen(true);

  const handleDeselectAll = () => {
    fileStore.toggleFilesSelected(
      fileStore.selected.map((f) => f.id),
      false
    );

    toast.info("Deselected all files");
  };

  const handleSelectAll = () => {
    fileStore.toggleFilesSelected(
      fileStore.displayed.map((f) => f.id),
      true
    );

    toast.info(
      `Added ${fileStore.displayed.length} files to selection (${fileStore.selected.length})`
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

          <ImportsProgress />
        </span>

        <span className={css.divisions}>
          {fileStore.isArchiveOpen && (
            <IconButton
              name="Delete"
              onClick={handleDelete}
              disabled={fileStore.selected.length === 0}
              size="medium"
            />
          )}

          <IconButton
            name={fileStore.isArchiveOpen ? "Unarchive" : "Archive"}
            onClick={fileStore.isArchiveOpen ? handleUnarchive : handleDelete}
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

      {isTaggerOpen && <Tagger setIsOpen={setIsTaggerOpen} />}
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
