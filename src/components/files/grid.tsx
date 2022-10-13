import { ipcRenderer } from "electron";
import { useContext, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { colors, Chip, Paper } from "@mui/material";
import { HomeContext } from "views";
import { Icon, SideScroller, Tag, View } from "components";
import { ContextMenu } from ".";
import { dayjs, makeClasses } from "utils";

interface FileGridProps {
  id: string;
}

const FileGrid = observer(({ id }: FileGridProps) => {
  const context = useContext(HomeContext);
  const { fileStore, tagStore } = useStores();
  const file = fileStore.getById(id);

  const { classes: css } = useClasses({ selected: file?.isSelected });

  const thumbInterval = useRef(null);
  const [thumbIndex, setThumbIndex] = useState(0);

  const handleMouseEnter = () => {
    thumbInterval.current = setInterval(() => {
      setThumbIndex((thumbIndex) =>
        thumbIndex + 1 === file?.thumbPaths.length ? 0 : thumbIndex + 1
      );
    }, 300);
  };

  const handleMouseLeave = () => {
    clearInterval(thumbInterval.current);
    thumbInterval.current = null;
    setThumbIndex(0);
  };

  const handleTagPress = (tagId: string) => {
    tagStore.setActiveTagId(tagId);
    tagStore.setTagManagerMode("edit");
    tagStore.setIsTagManagerOpen(true);
  };

  const openFile = () => {
    ipcRenderer.send("createCarouselWindow", {
      fileId: id,
      height: file.height,
      selectedFileIds: context.filteredFiles.map((f) => f.id),
      width: file.width,
    });
  };

  return (
    <ContextMenu fileId={id} className={`${css.container} selectable`}>
      <Paper onDoubleClick={openFile} elevation={3} className={css.paper}>
        <View
          onMouseEnter={file?.isAnimated ? handleMouseEnter : null}
          onMouseLeave={file?.isAnimated ? handleMouseLeave : null}
          className={css.imageContainer}
        >
          <Chip
            icon={<Icon name="Star" color={colors.amber["600"]} size="inherit" />}
            label={file?.rating}
            className={css.rating}
          />

          <img
            src={file?.thumbPaths[thumbIndex] ?? file?.path}
            className={css.image}
            alt={file?.originalName}
            draggable={false}
          />

          <Chip label={file?.ext} className={css.ext} />

          {file?.collections?.length > 0 && (
            <Chip
              icon={<Icon name="Collections" size="inherit" margins={{ left: "0.5rem" }} />}
              label={file.collections.length}
              className={css.collections}
            />
          )}

          {file?.duration && (
            <Chip
              label={dayjs.duration(file.duration, "s").format("HH:mm:ss")}
              className={css.duration}
            />
          )}
        </View>

        <SideScroller innerClassName={css.tags}>
          {file?.tags?.map?.((t) => (
            <Tag key={t.id} id={t.id} onClick={() => handleTagPress(t.id)} size="small" />
          ))}
        </SideScroller>
      </Paper>
    </ContextMenu>
  );
});

export default FileGrid;

const useClasses = makeClasses((theme, { selected }) => ({
  container: {
    flexBasis: "calc(100% / 7)",
    [theme.breakpoints.down("xl")]: { flexBasis: "calc(100% / 5)" },
    [theme.breakpoints.down("lg")]: { flexBasis: "calc(100% / 4)" },
    [theme.breakpoints.down("md")]: { flexBasis: "calc(100% / 3)" },
    border: "1px solid",
    borderColor: "#0f0f0f",
    borderRadius: 4,
    padding: "0.25rem",
    height: "fit-content",
    backgroundColor: selected ? colors.grey["600"] : "transparent",
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
  image: {
    width: "100%",
    height: "9rem",
    objectFit: "cover",
    borderTopLeftRadius: "inherit",
    borderTopRightRadius: "inherit",
    userSelect: "none",
  },
  imageContainer: {
    position: "relative",
    borderTopLeftRadius: "inherit",
    borderTopRightRadius: "inherit",
  },
  paper: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    height: "auto",
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
    borderBottomLeftRadius: "inherit",
    borderBottomRightRadius: "inherit",
    padding: "0.2em 0.3em",
    height: "1.8rem",
  },
}));
