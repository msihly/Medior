import { useCallback, useMemo, useState } from "react";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { FixedSizeGrid } from "react-window";
import AutoSizer from "react-virtualized-auto-sizer";
import { FileCollectionFile } from "components";
import { useDeepMemo } from "utils";

const CARD_HEIGHT = 300;
const CARD_MAX_WIDTH = 300;

export const EditorFiles = observer(() => {
  const stores = useStores();
  const sortedFiles = useDeepMemo(stores.collection.sortedEditorFiles);

  const [width, setWidth] = useState(0);
  const handleResize = ({ width }) => setWidth(width);

  const [columnCount, columnWidth, rowCount] = useMemo(() => {
    const columnCount = Math.floor(width / CARD_MAX_WIDTH);
    const columnWidth = width / columnCount - 3;
    const rowCount = Math.ceil(sortedFiles.length / columnCount);
    return [columnCount, columnWidth, rowCount];
  }, [sortedFiles.length, width]);

  const renderFile = useCallback(
    ({ columnIndex, rowIndex, style }) => {
      const index = rowIndex * columnCount + columnIndex;
      if (index >= sortedFiles.length) return null;
      const newIndex = sortedFiles[index]?.index;

      const file = sortedFiles.find((f) => f.index === newIndex);
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
    [columnCount, columnWidth, rowCount, sortedFiles]
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
