import { useContext, useEffect, useRef } from "react";
import { FixedSizeList } from "react-window";
import AutoSizer from "react-virtualized-auto-sizer";
import { CarouselContext, CarouselThumb } from ".";
import { makeClasses } from "utils";

const THUMB_WIDTH = 135; // px

const CarouselThumbNavigator = () => {
  const { activeFileId, selectedFileIds, setActiveFileId } = useContext(CarouselContext);

  const { classes: css } = useClasses(null);

  const listRef = useRef<FixedSizeList>(null);

  useEffect(() => {
    if (listRef.current !== null && selectedFileIds?.length > 0) {
      const activeIndex = selectedFileIds.findIndex((id) => id === activeFileId);
      console.log("Scrolling to index:", activeIndex);
      listRef.current.scrollToItem(activeIndex, "center");
      // console.log("Scrolling to index:", activeIndex);
      // listRef.current.scrollTo(activeIndex * THUMB_WIDTH);
    }
  }, [activeFileId, selectedFileIds]);

  return (
    <AutoSizer disableHeight>
      {({ width }) => (
        <FixedSizeList
          ref={listRef}
          layout="horizontal"
          width={width}
          height={THUMB_WIDTH}
          itemCount={selectedFileIds.length}
          itemSize={THUMB_WIDTH}
          className={css.thumbnails}
        >
          {({ index, style }) => (
            <CarouselThumb key={index} id={selectedFileIds[index]} style={style} />
          )}
        </FixedSizeList>
      )}
    </AutoSizer>
  );
};

export default CarouselThumbNavigator;

const useClasses = makeClasses({
  thumbnails: {
    justifyContent: "center",
  },
});
