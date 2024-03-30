import { useCallback, useMemo, useState } from "react";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { FixedSizeGrid } from "react-window";
import AutoSizer from "react-virtualized-auto-sizer";
import { FileCollectionFile } from "components";
import { useDeepMemo } from "utils";

const CARD_HEIGHT = 250;
const CARD_MAX_WIDTH = 250;

export const SortedFiles = observer(() => {
  const { fileCollectionStore } = useStores();
  const sortedActiveFiles = useDeepMemo(fileCollectionStore.sortedActiveFiles);

  const [width, setWidth] = useState(0);
  const handleResize = ({ width }) => setWidth(width);

  const [columnCount, columnWidth, rowCount] = useMemo(() => {
    const columnCount = Math.floor(width / CARD_MAX_WIDTH);
    const columnWidth = width / columnCount;
    const rowCount = Math.ceil(sortedActiveFiles.length / columnCount);
    return [columnCount, columnWidth, rowCount];
  }, [sortedActiveFiles.length, width]);

  const renderFile = useCallback(
    ({ columnIndex, rowIndex, style }) => {
      const index = rowIndex * columnCount + columnIndex;
      if (index >= sortedActiveFiles.length) return null;
      const newIndex = sortedActiveFiles[index]?.index;

      const file = sortedActiveFiles.find((f) => f.index === newIndex);
      if (!file) return null;

      return (
        <FileCollectionFile
          {...{ style }}
          key={`${columnIndex}-${rowIndex}`}
          fileColFile={file}
          width={columnWidth}
        />
      );
    },
    [columnCount, columnWidth, rowCount, sortedActiveFiles]
  );

  return (
    <AutoSizer onResize={handleResize}>
      {({ height, width }) => (
        <FixedSizeGrid
          {...{ columnCount, columnWidth, height, rowCount, width }}
          rowHeight={CARD_HEIGHT}
          overscanRowCount={1}
          overscanColumnCount={0}
        >
          {renderFile}
        </FixedSizeGrid>
      )}
    </AutoSizer>
  );
});
