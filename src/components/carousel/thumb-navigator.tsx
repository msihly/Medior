import { useContext, useEffect, useRef, useState } from "react";
import { FixedSizeList, ListOnScrollProps } from "react-window";
import AutoSizer from "react-virtualized-auto-sizer";
import { CarouselContext, CarouselThumb } from ".";
import { makeClasses, useDragScroll } from "utils";
import { View } from "components";

const THUMB_WIDTH = 135; // px

const CarouselThumbNavigator = () => {
  const { activeFileId, selectedFileIds } = useContext(CarouselContext);
  const { classes: css } = useClasses(null);

  const listRef = useRef<FixedSizeList>(null);
  const listOuterRef = useRef(null);
  const scrollLeft = useRef(0);

  const [screenWidth, setScreenWidth] = useState(0);

  const { handleMouseDown, isDragging } = useDragScroll({
    listRef,
    listOuterRef,
    scrollLeft,
    screenWidth,
  });

  const handleScroll = ({ scrollOffset }: ListOnScrollProps) => {
    // console.debug("ScrollOffset:", scrollOffset);
    scrollLeft.current = scrollOffset;
  };

  useEffect(() => {
    if (listRef.current !== null && selectedFileIds?.length > 0) {
      const activeIndex = selectedFileIds.findIndex((id) => id === activeFileId);
      const newScrollLeft = activeIndex * THUMB_WIDTH + THUMB_WIDTH / 2 - screenWidth / 2;
      listRef.current.scrollTo(newScrollLeft);
    }
  }, [activeFileId, screenWidth, selectedFileIds]);

  return (
    <View onMouseDown={handleMouseDown} className={css.root}>
      <AutoSizer onResize={({ width }) => setScreenWidth(width)} disableHeight>
        {({ width }) => (
          <FixedSizeList
            ref={listRef}
            outerRef={listOuterRef}
            onScroll={handleScroll}
            layout="horizontal"
            width={width}
            height={THUMB_WIDTH}
            itemSize={THUMB_WIDTH}
            itemCount={selectedFileIds.length}
            overscanCount={10}
            className={css.thumbnails}
          >
            {({ index, style }) => (
              <CarouselThumb
                key={index}
                id={selectedFileIds[index]}
                isDragging={isDragging}
                style={style}
              />
            )}
          </FixedSizeList>
        )}
      </AutoSizer>
    </View>
  );
};

export default CarouselThumbNavigator;

const useClasses = makeClasses({
  root: {
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
});
