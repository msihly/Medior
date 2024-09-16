import { useCallback, useMemo, useState } from "react";
import { observer, useStores } from "medior/store";
import { FixedSizeGrid } from "react-window";
import AutoSizer from "react-virtualized-auto-sizer";
import { FileCollectionFile } from "medior/components";

const CARD_HEIGHT = 300;
const CARD_MAX_WIDTH = 240;

export const EditorFiles = observer(() => {
  const stores = useStores();
  const sortedFileIdIndexes = stores.collection.editor.sortedFileIndexes;

  const [width, setWidth] = useState(0);
  const handleResize = ({ width }) => setWidth(width);

  const [columnCount, columnWidth, rowCount] = useMemo(() => {
    const columnCount = Math.floor(width / CARD_MAX_WIDTH);
    const columnWidth = width / columnCount - 3;
    const rowCount = Math.ceil(sortedFileIdIndexes.length / columnCount);
    return [columnCount, columnWidth, rowCount];
  }, [sortedFileIdIndexes.length, width]);

  const renderFile = useCallback(
    ({ columnIndex, rowIndex, style }) => {
      const index = rowIndex * columnCount + columnIndex;
      if (index >= sortedFileIdIndexes.length) return null;
      const newIndex = sortedFileIdIndexes[index]?.index;

      const fileIdIndex = sortedFileIdIndexes.find((f) => f.index === newIndex);
      if (!fileIdIndex) return null;

      return (
        <FileCollectionFile
          {...{ style }}
          key={`${columnIndex}-${rowIndex}`}
          id={fileIdIndex.id}
          width={columnWidth}
          height={CARD_HEIGHT}
        />
      );
    },
    [columnCount, columnWidth, rowCount, sortedFileIdIndexes]
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
