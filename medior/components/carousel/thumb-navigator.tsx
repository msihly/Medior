import { useEffect, useRef, useState } from "react";
import { observer, useStores } from "medior/store";
import { FixedSizeList, ListOnScrollProps } from "react-window";
import AutoSizer from "react-virtualized-auto-sizer";
import { CarouselThumb } from ".";
import { IconButton, View } from "medior/components";
import { CONSTANTS, makeClasses, useDragScroll } from "medior/utils";
import Color from "color";

export const CarouselThumbNavigator = observer(() => {
  const stores = useStores();

  const listRef = useRef<FixedSizeList>(null);
  const listOuterRef = useRef(null);
  const scrollLeft = useRef(0);

  const [isVisible, setIsVisible] = useState(false);
  const [width, setWidth] = useState(0);

  const { css } = useClasses({ isMouseMoving: stores.carousel.isMouseMoving, isVisible });

  const { handleMouseDown, isDragging } = useDragScroll({
    listRef,
    listOuterRef,
    scrollLeft,
    width,
  });

  const handleScroll = ({ scrollOffset }: ListOnScrollProps) => (scrollLeft.current = scrollOffset);

  const toggleVisibility = () => setIsVisible(!isVisible);

  useEffect(() => {
    if (listRef.current !== null && stores.carousel.activeFileIndex > -1) {
      const newScrollLeft =
        stores.carousel.activeFileIndex * CONSTANTS.CAROUSEL.THUMB_NAV.WIDTH +
        CONSTANTS.CAROUSEL.THUMB_NAV.WIDTH / 2 -
        width / 2;
      listRef.current.scrollTo(newScrollLeft);
    }
  }, [stores.carousel.activeFileIndex, width]);

  return (
    <View className={css.root}>
      <View row justify="center">
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
              height={CONSTANTS.CAROUSEL.THUMB_NAV.WIDTH}
              itemSize={CONSTANTS.CAROUSEL.THUMB_NAV.WIDTH}
              itemCount={stores.carousel.selectedFileIds.length}
              overscanCount={7}
              className={css.thumbnails}
            >
              {({ index, style }) => (
                <CarouselThumb
                  key={index}
                  id={stores.carousel.selectedFileIds[index]}
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
    marginBottom: 10 + (props.isVisible ? 0 : CONSTANTS.CAROUSEL.VIDEO.CONTROLS_HEIGHT),
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    opacity: props.isMouseMoving || props.isVisible ? 0.4 : 0,
    pointerEvents: "auto",
    transition: "all 200ms ease-in-out",
    "&:hover": {
      backgroundColor: "rgba(0, 0, 0, 0.6)",
      opacity: 1,
    },
  },
  root: {
    position: "absolute",
    bottom: props.isVisible ? 0 : -CONSTANTS.CAROUSEL.THUMB_NAV.WIDTH,
    right: 0,
    left: 0,
    zIndex: 5,
    pointerEvents: props.isVisible ? "auto" : "none",
    transition: "all 200ms ease-in-out",
  },
  scrollContainer: {
    backgroundColor: Color("black").fade(0.3).string(),
    overflowX: "scroll",
    whiteSpace: "nowrap",
    zIndex: 15,
    "&::-webkit-scrollbar": { height: 0 },
  },
  thumbnails: {
    justifyContent: "center",
    userSelect: "none",
    "&::-webkit-scrollbar": { height: 0 },
  },
}));
