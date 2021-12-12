import { useContext, useMemo, useState } from "react";
import { actions, useDispatch, useSelector } from "store";
import { AppBar, colors } from "@mui/material";
import { makeStyles } from "utils";
import { toast } from "react-toastify";
import { AppContext } from "app";
import { IconButton } from "components/buttons";
import { Tagger } from "components/tags";
import { SortMenu } from ".";

const TopBar = () => {
  const { isArchiveOpen, isDrawerOpen, setIsDrawerOpen }: any = useContext(AppContext);

  const { classes: css } = useClasses();
  const dispatch = useDispatch();

  const images = useSelector((state) => state.images);
  const selected = useMemo(() => images.filter((img) => img.isSelected), [images]);

  const imports = useSelector((state) => state.imports);

  const [isTaggerOpen, setIsTaggerOpen] = useState(false);

  const handleSelectAll = () => {
    dispatch(
      actions.imagesUpdated(images.map((i) => ({ ...i, isSelected: selected.length === 0 })))
    );
    toast.info(`${selected.length === 0 ? "Selected" : "Deselected"} all images`);
  };

  const handleDelete = () => dispatch(actions.deleteImages(selected));

  const handleEditTags = () => setIsTaggerOpen(true);

  const handleUnarchive = () => dispatch(actions.unarchiveImages(selected));

  return (
    <AppBar position="relative" className={css.appBar}>
      <div className={css.container}>
        <span className={css.divisions}>
          {!isDrawerOpen && (
            <IconButton name="Menu" onClick={() => setIsDrawerOpen(true)} size="medium" />
          )}

          {imports}
        </span>

        <span className={css.divisions}>
          {isArchiveOpen && <IconButton name="Delete" onClick={handleDelete} size="medium" />}

          <IconButton
            name={isArchiveOpen ? "Unarchive" : "Archive"}
            onClick={isArchiveOpen ? handleUnarchive : handleDelete}
            size="medium"
          />

          <IconButton name="Label" onClick={handleEditTags} size="medium" />

          <IconButton name="SelectAll" onClick={handleSelectAll} size="medium" />

          <SortMenu />
        </span>
      </div>

      <Tagger isOpen={isTaggerOpen} setIsOpen={setIsTaggerOpen} />
    </AppBar>
  );
};

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
