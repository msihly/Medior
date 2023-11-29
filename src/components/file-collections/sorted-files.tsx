import { useCallback, useState } from "react";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { FixedSizeGrid } from "react-window";
import AutoSizer from "react-virtualized-auto-sizer";
import { FileCollectionFile } from "components";

export const SortedFiles = observer(() => {
  const { fileCollectionStore } = useStores();

  const [width, setWidth] = useState(0);

  const columnCount = 4;
  const columnWidth = width / 4 - columnCount;
  const rowCount = Math.ceil(fileCollectionStore.activeFiles.length / columnCount);
  const rowHeight = 245;

  const handleResize = ({ width }) => setWidth(width);

  const renderFile = useCallback(
    ({ columnIndex, rowIndex, style }) => {
      const index = rowIndex * columnCount + columnIndex;
      if (index >= fileCollectionStore.sortedActiveFiles.length) return null;
      const newIndex = fileCollectionStore.sortedActiveFiles[index]?.index;

      const fileId = fileCollectionStore.sortedActiveFiles.find((f) => f.index === newIndex)?.file
        ?.id;
      if (!fileId) return null;

      return (
        <FileCollectionFile
          {...{ fileId, style }}
          key={`${columnIndex}-${rowIndex}`}
          width={columnWidth}
        />
      );
    },
    [columnCount, columnWidth, fileCollectionStore.sortedActiveFiles.toString(), rowCount]
  );

  return (
    <AutoSizer onResize={handleResize}>
      {({ height, width }) => {
        return (
          <FixedSizeGrid
            {...{ columnCount, columnWidth, height, rowCount, rowHeight, width }}
            overscanRowCount={0}
            overscanColumnCount={0}
          >
            {renderFile}
          </FixedSizeGrid>
        );
      }}
    </AutoSizer>
  );
});
