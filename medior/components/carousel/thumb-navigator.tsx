import { useEffect, useRef, useState } from "react";
import { CellComponentProps, Grid, GridImperativeAPI, GridProps } from "react-window";
import Color from "color";
import { CarouselThumb, Comp, IconButton, View } from "medior/components";
import { useStores } from "medior/store";
import { makeClasses, useDragScroll } from "medior/utils/client";
import { CONSTANTS } from "medior/utils/common";

export const CarouselThumbNavigator = Comp(() => {
  const stores = useStores();
  const store = stores.carousel;

  const [isVisible, setIsVisible] = useState(false);
  const [visibleRange, setVisibleRange] = useState({ start: 0, stop: -1 });
  const [width, setWidth] = useState(0);

  const gridRef = useRef<GridImperativeAPI>(null);

  const visibleFileIds = store.selectedFileIds.slice(visibleRange.start, visibleRange.stop + 1);

  const { css } = useClasses({ isMouseMoving: store.isMouseMoving, isVisible });

  const { handleMouseDown, isDragging } = useDragScroll({ listRef: gridRef });

  const handleCellsRendered: GridProps<ThumbCellProps>["onCellsRendered"] = (
    _,
    { columnStartIndex, columnStopIndex },
  ) => {
    setVisibleRange((previous) =>
      previous.start === columnStartIndex && previous.stop === columnStopIndex
        ? previous
        : { start: columnStartIndex, stop: columnStopIndex },
    );
  };

  const handleResize: GridProps<ThumbCellProps>["onResize"] = ({ width }) => setWidth(width);

  const toggleVisibility = () => setIsVisible(!isVisible);

  useEffect(() => {
    if (visibleFileIds.join() !== store.visibleFileIds.join())
      store.setVisibleFileIds(visibleFileIds);
  }, [visibleFileIds.join()]);

  useEffect(() => {
    const element = gridRef.current?.element;
    if (element && store.activeFileIndex > -1)
      element.scrollLeft =
        store.activeFileIndex * CONSTANTS.CAROUSEL.THUMB_NAV.WIDTH +
        CONSTANTS.CAROUSEL.THUMB_NAV.WIDTH / 2 -
        width / 2;
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
        <Grid
          gridRef={gridRef}
          cellComponent={ThumbCell}
          cellProps={{ fileIds: store.selectedFileIds, isDragging }}
          columnCount={store.selectedFileIds.length}
          columnKey={getThumbColumnKey}
          columnWidth={CONSTANTS.CAROUSEL.THUMB_NAV.WIDTH}
          onCellsRendered={handleCellsRendered}
          onResize={handleResize}
          overscanCount={7}
          rowCount={1}
          rowHeight={CONSTANTS.CAROUSEL.THUMB_NAV.WIDTH}
          className={css.thumbnails}
        />
      </View>
    </View>
  );
});

interface ThumbCellProps {
  fileIds: string[];
  isDragging: boolean;
}

const ThumbCell = ({ columnIndex, fileIds, isDragging, style }: CellComponentProps<ThumbCellProps>) => (
  <CarouselThumb id={fileIds[columnIndex]} isDragging={isDragging} style={style} />
);

// Ids are inserted in place, so keying cells by id re-renders the ones an insert shifts.
const getThumbColumnKey: GridProps<ThumbCellProps>["columnKey"] = ({ columnIndex, data }) =>
  data.fileIds[columnIndex];

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
    height: CONSTANTS.CAROUSEL.THUMB_NAV.WIDTH,
    justifyContent: "center",
    userSelect: "none",
  },
}));
