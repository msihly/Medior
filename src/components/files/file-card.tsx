import { getCurrentWebContents } from "@electron/remote";
import { useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { File, useStores } from "store";
import { colors, Chip, Paper } from "@mui/material";
import { Icon, Tag, View } from "components";
import { ContextMenu, FileTooltip, openFile } from ".";
import { dayjs, makeClasses, uniqueArrayFilter } from "utils";
import { CSSObject } from "tss-react";
import Color from "color";

interface FileCardProps {
  file?: File;
  id?: string;
}

export const FileCard = observer(({ file, id }: FileCardProps) => {
  const { fileStore, homeStore, tagStore } = useStores();
  if (!file) file = fileStore.getById(id);

  const thumbInterval = useRef(null);

  const [imagePos, setImagePos] = useState<CSSObject["objectPosition"]>(null);
  const [thumbIndex, setThumbIndex] = useState(0);

  const { css } = useClasses({
    fileCardFit: homeStore.fileCardFit,
    imagePos,
    selected: fileStore.getIsSelected(file.id),
  });

  const handleClick = (event: React.MouseEvent) => {
    if (event.shiftKey) {
      const clickedIndex = fileStore.filteredFileIds.indexOf(file.id);
      const firstIndex = fileStore.filteredFileIds.indexOf(fileStore.selectedIds[0]);

      const isFirstAfterClicked = firstIndex >= clickedIndex;
      const startIndex = isFirstAfterClicked ? clickedIndex : firstIndex;
      const endIndex = isFirstAfterClicked ? firstIndex : clickedIndex;

      const selectedIds =
        startIndex === endIndex
          ? []
          : uniqueArrayFilter(
              fileStore.filteredFileIds.slice(startIndex, endIndex + 1),
              fileStore.selectedIds
            );

      /** Deselect the files before the clicked file if the first index is after it, or deselect the files after the clicked file if the first index is before it. */
      const unselectedIds = fileStore.selectedIds.filter(
        (id) =>
          (isFirstAfterClicked && fileStore.filteredFileIds.indexOf(id) < clickedIndex) ||
          (!isFirstAfterClicked && fileStore.filteredFileIds.indexOf(id) > clickedIndex)
      );

      fileStore.toggleFilesSelected([
        ...selectedIds.map((id) => ({ id, isSelected: true })),
        ...unselectedIds.map((id) => ({ id, isSelected: false })),
      ]);
    } else if (event.ctrlKey) {
      /** Toggle the selected state of the file that was clicked. */
      fileStore.toggleFilesSelected([
        { id: file.id, isSelected: !fileStore.getIsSelected(file.id) },
      ]);
    } else {
      /** Deselect all the files and select the file that was clicked. */
      fileStore.toggleFilesSelected([
        ...fileStore.selectedIds.map((id) => ({ id, isSelected: false })),
        { id: file.id, isSelected: true },
      ]);
    }
  };

  const handleDoubleClick = () => openFile({ file, filteredFileIds: fileStore.filteredFileIds });

  const handleDragStart = async (event: React.DragEvent) => {
    event.preventDefault();
    homeStore.setIsDraggingOut(true);

    const hasSelected = fileStore.selectedIds.length > 0;
    const files = hasSelected ? await loadSelectedFiles() : null;
    const filePaths = hasSelected ? files.map((file) => file.path) : [file.path];
    const icon = hasSelected ? files[0].thumbPaths[0] : file.thumbPaths[0];

    getCurrentWebContents().startDrag({ file: file.path, files: filePaths, icon });
  };

  const handleDragEnd = () => homeStore.setIsDraggingOut(false);

  const handleMouseEnter = () => {
    clearInterval(thumbInterval.current); /** Safety check for failed onMouseLeave */
    thumbInterval.current = setInterval(() => {
      setThumbIndex((thumbIndex) =>
        thumbIndex + 1 === file.thumbPaths.length ? 0 : thumbIndex + 1
      );
    }, 300);
  };

  const handleMouseLeave = () => {
    clearInterval(thumbInterval.current);
    thumbInterval.current = null;
    setThumbIndex(0);
    setImagePos(null);
  };

  const handleMouseMove = (event: React.MouseEvent) => {
    const { height, left, top, width } = event.currentTarget.getBoundingClientRect();
    const offsetX = event.pageX - left;
    const offsetY = event.pageY - top;
    const pos = `${(Math.max(0, offsetX) / width) * 100}% ${
      (Math.max(0, offsetY) / height) * 100
    }%`;

    setImagePos(pos);
  };

  const handleTagPress = (tagId: string) => {
    tagStore.setActiveTagId(tagId);
    tagStore.setTagManagerMode("edit");
    tagStore.setIsTagManagerOpen(true);
  };

  const loadSelectedFiles = async () => {
    const res = await fileStore.loadFiles({ fileIds: fileStore.selectedIds, withOverwrite: false });
    if (!res?.success) throw new Error(res.error);
    return res.data;
  };

  return (
    <ContextMenu key="context-menu" file={file} className={`${css.container} selectable`}>
      <Paper
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        elevation={3}
        className={css.paper}
      >
        <View
          onMouseEnter={file.isAnimated ? handleMouseEnter : null}
          onMouseLeave={handleMouseLeave}
          className={css.imageContainer}
        >
          <Chip
            icon={<Icon name="Star" color={colors.amber["600"]} size="inherit" />}
            label={file.rating}
            className={css.rating}
          />

          <img
            id={file.id}
            src={file.thumbPaths[thumbIndex]}
            alt={file.originalName}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onMouseMove={homeStore.fileCardFit === "cover" ? handleMouseMove : null}
            onMouseLeave={homeStore.fileCardFit === "cover" ? handleMouseLeave : null}
            draggable
            loading="lazy"
            className={css.image}
          />

          <Chip label={file.ext} className={css.ext} />

          {/* {file.collections.length > 0 && (
            <Chip
              icon={<Icon name="Collections" size="inherit" margins={{ left: "0.5rem" }} />}
              label={file.collections.length}
              className={css.collections}
            />
          )} */}

          {file.duration && (
            <Chip
              label={dayjs.duration(file.duration, "s").format("HH:mm:ss")}
              className={css.duration}
            />
          )}
        </View>

        <View row className={css.footer}>
          <View row className={css.tags}>
            {file.tags.slice(0, 5).map((tag) => (
              <Tag key={tag.id} tag={tag} onClick={() => handleTagPress(tag.id)} size="small" />
            ))}
          </View>

          <FileTooltip file={file} onTagPress={handleTagPress} />
        </View>
      </Paper>
    </ContextMenu>
  );
});

const useClasses = makeClasses((theme, { fileCardFit, imagePos, selected }) => ({
  container: {
    flexBasis: "calc(100% / 6)",
    [theme.breakpoints.down("xl")]: { flexBasis: "calc(100% / 5)" },
    [theme.breakpoints.down("lg")]: { flexBasis: "calc(100% / 4)" },
    [theme.breakpoints.down("md")]: { flexBasis: "calc(100% / 2)" },
    [theme.breakpoints.down("sm")]: { flexBasis: "calc(100% / 1)" },
    border: "1px solid",
    borderColor: "#0f0f0f",
    borderRadius: 4,
    padding: "0.25rem",
    height: "fit-content",
    background: selected
      ? `linear-gradient(to bottom right, ${colors.blue["800"]}, ${Color(colors.blue["900"])
          .fade(0.5)
          .string()} 60%)`
      : "transparent",
    overflow: "hidden",
    cursor: "pointer",
    userSelect: "none",
  },
  duration: {
    position: "absolute",
    bottom: "0.5rem",
    right: "0.5rem",
    backgroundColor: colors.grey["900"],
    opacity: 0.5,
    cursor: "pointer",
    transition: "all 200ms ease-in-out",
    "&:hover": {
      opacity: 0.8,
    },
  },
  ext: {
    position: "absolute",
    top: "0.5rem",
    right: "0.5rem",
    backgroundColor: colors.grey["900"],
    opacity: 0.5,
    cursor: "pointer",
    transition: "all 200ms ease-in-out",
    "&:hover": {
      opacity: 0.8,
    },
  },
  footer: {
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomLeftRadius: "inherit",
    borderBottomRightRadius: "inherit",
    padding: "0.2em 0.3em",
    height: "1.8rem",
    backgroundColor: "inherit",
  },
  image: {
    borderTopLeftRadius: "inherit",
    borderTopRightRadius: "inherit",
    width: "100%",
    height: "22rem",
    [theme.breakpoints.down("xl")]: { height: "14rem" },
    [theme.breakpoints.down("sm")]: { height: "18rem" },
    userSelect: "none",
    transition: "all 100ms ease",
    objectFit: fileCardFit,
    objectPosition: imagePos,
  },
  imageContainer: {
    position: "relative",
    display: "flex",
    flex: 1,
    borderTopLeftRadius: "inherit",
    borderTopRightRadius: "inherit",
    backgroundColor: "inherit",
  },
  paper: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    height: "auto",
    backgroundColor: colors.grey["900"],
    userSelect: "none",
  },
  rating: {
    position: "absolute",
    top: "0.5rem",
    left: "0.5rem",
    backgroundColor: colors.grey["900"],
    opacity: 0.7,
    cursor: "pointer",
    transition: "all 200ms ease-in-out",
    "&:hover": {
      opacity: 0.85,
    },
  },
  tags: {
    position: "relative",
    overflow: "hidden",
    width: "100%",
    "&::after": {
      content: '""',
      position: "absolute",
      top: 0,
      bottom: 0,
      right: 0,
      left: 0,
      background: `linear-gradient(to right, transparent 60%, ${colors.grey["900"]})`,
    },
  },
  tooltip: {
    backgroundColor: colors.grey["900"],
    boxShadow: "rgb(0 0 0 / 50%) 1px 2px 4px 0px",
  },
}));
