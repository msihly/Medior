import { useState } from "react";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { deleteFiles } from "database";
import { toast } from "react-toastify";
import { makeStyles } from "utils";
import { AppBar, colors } from "@mui/material";
import { IconButton, ImportsProgress, Tagger } from "components";
import { SortMenu } from ".";

const TopBar = observer(() => {
  const { appStore, fileStore } = useStores();
  const { classes: css } = useClasses();

  const [isTaggerOpen, setIsTaggerOpen] = useState(false);

  const handleSelectAll = () => {
    const isAnySelected = fileStore.selected?.length > 0;

    fileStore.toggleFilesSelected(
      fileStore.files.map((f) => f.id),
      !isAnySelected
    );

    toast.info(`${!isAnySelected ? "Selected" : "Deselected"} all files`);
  };

  const handleDelete = () => deleteFiles(fileStore, fileStore.selected);

  const handleEditTags = () => setIsTaggerOpen(true);

  const handleUnarchive = () => deleteFiles(fileStore, fileStore.selected, true);

  return (
    <AppBar position="relative" className={css.appBar}>
      <div className={css.container}>
        <span className={css.divisions}>
          {!appStore.isDrawerOpen && (
            <IconButton name="Menu" onClick={() => appStore.setIsDrawerOpen(true)} size="medium" />
          )}

          <ImportsProgress />
        </span>

        <span className={css.divisions}>
          {fileStore.isArchiveOpen && (
            <IconButton name="Delete" onClick={handleDelete} size="medium" />
          )}

          <IconButton
            name={fileStore.isArchiveOpen ? "Unarchive" : "Archive"}
            onClick={fileStore.isArchiveOpen ? handleUnarchive : handleDelete}
            size="medium"
          />

          <IconButton name="Label" onClick={handleEditTags} size="medium" />

          <IconButton name="SelectAll" onClick={handleSelectAll} size="medium" />

          <SortMenu />
        </span>
      </div>

      {isTaggerOpen && <Tagger isOpen={isTaggerOpen} setIsOpen={setIsTaggerOpen} />}
    </AppBar>
  );
});

export default TopBar;

const useClasses = makeStyles()({
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
