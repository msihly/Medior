import { useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { colors, Chip, Paper } from "@mui/material";
import { Icon, SideScroller, Tag, Text, View } from "components";
import { makeClasses } from "utils";

interface FileCollectionProps {
  active?: boolean;
  id: string;
}

export const FileCollection = observer(({ active = false, id }: FileCollectionProps) => {
  const { fileCollectionStore } = useStores();
  const collection = fileCollectionStore.getById(id);

  const { css } = useClasses({ active });

  const thumbInterval = useRef(null);
  const [thumbIndex, setThumbIndex] = useState(0);

  const handleMouseEnter = () => {
    thumbInterval.current = setInterval(() => {
      setThumbIndex((thumbIndex) =>
        thumbIndex + 1 === collection.fileIndexes?.length ? 0 : thumbIndex + 1
      );
    }, 300);
  };

  const handleMouseLeave = () => {
    clearInterval(thumbInterval.current);
    thumbInterval.current = null;
    setThumbIndex(0);
  };

  const openCollection = () => {
    fileCollectionStore.setActiveCollectionId(id);
    fileCollectionStore.setIsCollectionEditorOpen(true);
  };

  return (
    <View className={css.container}>
      <Paper onDoubleClick={openCollection} elevation={3} className={css.paper}>
        <View
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          className={css.imageContainer}
        >
          <Chip
            icon={<Icon name="Star" color={colors.amber["600"]} size="inherit" />}
            label={collection?.rating}
            className={css.rating}
          />

          <Chip
            icon={<Icon name="Collections" size="inherit" margins={{ left: "0.5rem" }} />}
            label={collection?.fileIndexes?.length}
            className={css.fileCount}
          />

          <img
            src={collection?.thumbPaths[thumbIndex]}
            className={css.image}
            alt={collection?.title}
            draggable={false}
          />

          {collection?.title?.length > 0 && <Text>{collection.title}</Text>}
        </View>

        <SideScroller innerClassName={css.tags}>
          {collection?.tags?.map((t) => (
            <Tag key={t.id} tag={t} size="small" />
          ))}
        </SideScroller>
      </Paper>
    </View>
  );
});

const useClasses = makeClasses((theme, { active }) => ({
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
    backgroundColor: active ? colors.blue["600"] : "transparent",
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
  fileCount: {
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
