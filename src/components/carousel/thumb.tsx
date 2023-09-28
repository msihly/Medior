import { useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { colors, Chip } from "@mui/material";
import { Icon, View } from "components";
import { dayjs, makeClasses } from "utils";

interface CarouselThumbProps {
  id: string;
  isDragging?: boolean;
  style: React.CSSProperties;
}

export const CarouselThumb = observer(({ id, isDragging = false, style }: CarouselThumbProps) => {
  const { carouselStore, fileStore } = useStores();
  const file = fileStore.getById(id);

  const { css } = useClasses({ active: carouselStore.activeFileId === id });

  const thumbInterval = useRef<NodeJS.Timer>(null);
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

  const handleSelect = (event: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    if (isDragging) event.preventDefault();
    else carouselStore.setActiveFileId(id);
  };

  return (
    <View
      onClick={handleSelect}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={css.root}
      style={style}
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
          // className={css.collections}
        />
      )}

      {file?.duration && (
        <Chip
          label={dayjs.duration(file.duration, "s").format("HH:mm:ss")}
          className={css.duration}
        />
      )}
    </View>
  );
});

const useClasses = makeClasses((_, { active }) => ({
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
    width: "-webkit-fill-available",
    height: "-webkit-fill-available",
    objectFit: "cover",
    borderRadius: "inherit",
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
  root: {
    borderRadius: 4,
    padding: "0.25rem",
    width: 135,
    height: 135,
    backgroundColor: active ? colors.grey["800"] : "transparent",
  },
}));
