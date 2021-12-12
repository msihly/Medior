import { shell } from "electron";
import React, { useMemo } from "react";
import { useSelector } from "react-redux";
import { Paper, colors, Chip } from "@mui/material";
import { makeStyles } from "utils";
import { Tag } from "components/tags";
import { ContextMenu } from ".";
import { countItems, sortArray } from "utils";
import { SideScroller } from "components/wrappers";

const ImageGrid = ({ image, image: { ext, fileId, isSelected, originalName, path, tags } }) => {
  const { classes: css } = useClasses({ selected: isSelected });

  const openFile = () => shell.openPath(path);

  const images = useSelector((store) => store.images);

  const allTagCounts = useMemo(() => {
    return countItems(images.flatMap((img) => img.tags).filter((t) => t !== undefined));
  }, [images]);

  const tagCounts = useMemo(() => {
    return sortArray(
      tags.map((tag) => ({
        label: tag,
        count: allTagCounts.find((t) => t.value === tag)?.count,
      })),
      "count",
      true,
      true
    );
  }, [allTagCounts, tags]);

  return (
    <ContextMenu id={fileId} image={image} className={`${css.container} selectable`}>
      <Paper onDoubleClick={openFile} elevation={3} className={css.paper}>
        <div className={css.imageContainer}>
          <img src={path} className={css.image} alt={originalName} />

          <Chip label={ext} className={css.ext} />
        </div>

        <SideScroller>
          <div className={css.tags}>
            {tagCounts.map((t) => (
              <Tag key={t.label} {...t} size="small" clickable />
            ))}
          </div>
        </SideScroller>
      </Paper>
    </ContextMenu>
  );
};

export default ImageGrid;

const useClasses = makeStyles()((theme, { selected }) => ({
  container: {
    flexBasis: "calc(100% / 7)",
    [theme.breakpoints.down("xl")]: {
      flexBasis: "calc(100% / 5)",
    },
    [theme.breakpoints.down("xl")]: {
      flexBasis: "calc(100% / 3)",
    },
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
  name: {
    borderBottomLeftRadius: "inherit",
    borderBottomRightRadius: "inherit",
    padding: "0.2em 0.3em",
    textAlign: "center",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  tags: {
    display: "flex",
    flexFlow: "row nowrap",
    borderBottomLeftRadius: "inherit",
    borderBottomRightRadius: "inherit",
    padding: "0.2em 0.3em",
    height: "1.8rem",
    overflowY: "hidden",
    overflowX: "auto",
    "&::-webkit-scrollbar": {
      display: "none",
      height: "4px",
    },
    "&::-webkit-scrollbar-thumb": {
      background: colors.grey["600"],
    },
  },
}));
