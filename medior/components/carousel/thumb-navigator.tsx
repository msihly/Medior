import { useEffect, useRef, useState } from "react";
import AutoSizer from "react-virtualized-auto-sizer";
import { FixedSizeList, ListOnItemsRenderedProps, ListOnScrollProps } from "react-window";
import Color from "color";
import { CarouselThumb, Comp, IconButton, View } from "medior/components";
import { useStores } from "medior/store";
import { makeClasses, useDragScroll } from "medior/utils/client";
import { CONSTANTS } from "medior/utils/common";

export const CarouselThumbNavigator = Comp(() => {
  const stores = useStores();
  const store = stores.carousel;

  const listOuterRef = useRef(null);
  const listRef = useRef<FixedSizeList>(null);
  const scrollLeft = useRef(0);

  const [isVisible, setIsVisible] = useState(false);
  const [visibleRange, setVisibleRange] = useState({ start: 0, stop: -1 });
  const [width, setWidth] = useState(0);

  const visibleFileIds = store.selectedFileIds.slice(visibleRange.start, visibleRange.stop + 1);

  const { css } = useClasses({ isMouseMoving: store.isMouseMoving, isVisible });

  const { handleMouseDown, isDragging } = useDragScroll({
    listOuterRef,
    listRef,
    scrollLeft,
    width,
  });

  const handleScroll = ({ scrollOffset }: ListOnScrollProps) => (scrollLeft.current = scrollOffset);

  const handleItemsRendered = ({
    overscanStartIndex,
    overscanStopIndex,
  }: ListOnItemsRenderedProps) => {
    setVisibleRange((previous) =>
      previous.start === overscanStartIndex && previous.stop === overscanStopIndex
        ? previous
        : { start: overscanStartIndex, stop: overscanStopIndex },
    );
  };

  const toggleVisibility = () => setIsVisible(!isVisible);

  useEffect(() => {
    if (visibleFileIds.join() !== store.visibleFileIds.join())
      store.setVisibleFileIds(visibleFileIds);
  }, [visibleFileIds.join()]);

  useEffect(() => {
    if (listRef.current !== null && store.activeFileIndex > -1) {
      const newScrollLeft =
        store.activeFileIndex * CONSTANTS.CAROUSEL.THUMB_NAV.WIDTH +
        CONSTANTS.CAROUSEL.THUMB_NAV.WIDTH / 2 -
        width / 2;

      listRef.current.scrollTo(newScrollLeft);
    }
  }, [store.activeFileIndex, width]);

  return (
    <View className={css.root}>
      <View row justify="flex-end" padding={{ right: "1rem" }}>
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
              onItemsRendered={handleItemsRendered}
              onScroll={handleScroll}
              layout="horizontal"
              width={width}
              height={CONSTANTS.CAROUSEL.THUMB_NAV.WIDTH}
              itemSize={CONSTANTS.CAROUSEL.THUMB_NAV.WIDTH}
              itemCount={store.selectedFileIds.length}
              overscanCount={7}
              className={css.thumbnails}
            >
              {({ index, style }) => (
                <CarouselThumb
                  key={index}
                  id={store.selectedFileIds[index]}
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

interface ClassesProps {
  isMouseMoving: boolean;
  isVisible: boolean;
}

const useClasses = makeClasses((props: ClassesProps) => ({
  hideButton: {
    "&:hover": {
      backgroundColor: "rgba(0, 0, 0, 0.6)",
      opacity: 1,
    },
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    marginBottom: 10 + (props.isVisible ? 0 : CONSTANTS.CAROUSEL.VIDEO.CONTROLS_HEIGHT),
    opacity: props.isMouseMoving || props.isVisible ? 0.4 : 0,
    pointerEvents: "auto",
    transition: "all 200ms ease-in-out",
  },
  root: {
    bottom: props.isVisible ? 0 : -CONSTANTS.CAROUSEL.THUMB_NAV.WIDTH,
    left: 0,
    pointerEvents: props.isVisible ? "auto" : "none",
    position: "absolute",
    right: 0,
    transition: "all 200ms ease-in-out",
    zIndex: 5,
  },
  scrollContainer: {
    "&::-webkit-scrollbar": { height: 0 },
    backgroundColor: Color("black").fade(0.3).string(),
    overflowX: "scroll",
    whiteSpace: "nowrap",
    zIndex: 15,
  },
  thumbnails: {
    "&::-webkit-scrollbar": { height: 0 },
    justifyContent: "center",
    userSelect: "none",
  },
}));
