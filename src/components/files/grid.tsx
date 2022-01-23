import { shell } from "electron";
import { useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { Paper, colors, Chip } from "@mui/material";
import { SideScroller, Tag } from "components";
import { ContextMenu } from ".";
import { makeStyles } from "utils";

const FileGrid = observer(({ file, id }: any) => {
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

  const openFile = () => shell.openPath(file?.path);

  return (
    <ContextMenu id={id} file={file} className={`${css.container} selectable`}>
      <Paper onDoubleClick={openFile} elevation={3} className={css.paper}>
        <div
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          className={css.imageContainer}
        >
          <img
            src={file?.thumbPaths[thumbIndex] ?? file?.path}
            className={css.image}
            alt={file?.originalName}
          />

          <Chip label={file?.ext} className={css.ext} />
        </div>

        <SideScroller>
          <div className={css.tags}>
            {file?.tagCounts?.map?.((t) => (
              <Tag key={t.label} {...t} size="small" clickable />
            ))}
          </div>
        </SideScroller>
      </Paper>
    </ContextMenu>
  );
});

export default FileGrid;

const useClasses = makeStyles<object>()((theme, { selected }: any) => ({
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
