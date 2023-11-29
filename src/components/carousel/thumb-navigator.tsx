import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { FixedSizeList, ListOnScrollProps } from "react-window";
import AutoSizer from "react-virtualized-auto-sizer";
import { CarouselThumb, THUMB_WIDTH } from ".";
import { IconButton, View } from "components";
import { makeClasses, useDragScroll } from "utils";
import Color from "color";

export const CarouselThumbNavigator = observer(() => {
  const { carouselStore } = useStores();

  const listRef = useRef<FixedSizeList>(null);
  const listOuterRef = useRef(null);
  const scrollLeft = useRef(0);

  const [isVisible, setIsVisible] = useState(false);
  const [width, setWidth] = useState(0);

  const { css } = useClasses({ isVisible });

  const { handleMouseDown, isDragging } = useDragScroll({
    listRef,
    listOuterRef,
    scrollLeft,
    width,
  });

  const handleScroll = ({ scrollOffset }: ListOnScrollProps) => (scrollLeft.current = scrollOffset);

  const toggleVisibility = () => setIsVisible(!isVisible);

  useEffect(() => {
    if (listRef.current !== null && carouselStore.activeFileIndex > -1) {
      const newScrollLeft =
        carouselStore.activeFileIndex * THUMB_WIDTH + THUMB_WIDTH / 2 - width / 2;
      listRef.current.scrollTo(newScrollLeft);
    }
  }, [carouselStore.activeFileIndex, width]);

  return (
    <View className={css.root}>
      <View className={css.hideButtonContainer}>
        <IconButton
          name="ArrowUpward"
          onClick={toggleVisibility}
          iconProps={{ rotation: isVisible ? 180 : 0 }}
          className={css.hideButton}
        />
      </View>

      <View onMouseDown={handleMouseDown} className={css.scrollContainer}>
        <AutoSizer onResize={({ width }) => setWidth(width)} disableHeight>
          {({ width }) => (
            <FixedSizeList
              ref={listRef}
              outerRef={listOuterRef}
              onScroll={handleScroll}
              layout="horizontal"
              width={width}
              height={THUMB_WIDTH}
              itemSize={THUMB_WIDTH}
              itemCount={carouselStore.selectedFileIds.length}
              overscanCount={7}
              className={css.thumbnails}
            >
              {({ index, style }) => (
                <CarouselThumb
                  key={index}
                  id={carouselStore.selectedFileIds[index]}
                  isDragging={isDragging}
                  style={style}
                />
              )}
            </FixedSizeList>
          )}
        </AutoSizer>
      </View>
    </View>
  );
});

const useClasses = makeClasses((_, { isVisible }) => ({
  hideButton: {
    marginBottom: "0.3rem",
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    opacity: 0.4,
    transition: "all 200ms ease-in-out",
    "&:hover": {
      backgroundColor: "rgba(0, 0, 0, 0.6)",
      opacity: 1,
    },
  },
  hideButtonContainer: {
    display: "flex",
    justifyContent: "center",
  },
  root: {
    position: "absolute",
    bottom: isVisible ? 0 : -THUMB_WIDTH,
    right: 0,
    left: 0,
    zIndex: 5,
    transition: "all 200ms ease-in-out",
  },
  scrollContainer: {
    backgroundColor: Color("black").fade(0.3).string(),
    overflowX: "scroll",
    whiteSpace: "nowrap",
    "&::-webkit-scrollbar": {
      height: 0,
    },
  },
  thumbnails: {
    justifyContent: "center",
    userSelect: "none",
    "&::-webkit-scrollbar": {
      height: 0,
    },
  },
}));
