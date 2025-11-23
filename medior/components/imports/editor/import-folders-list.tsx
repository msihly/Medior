import { useEffect, useRef } from "react";
import AutoSizer from "react-virtualized-auto-sizer";
import { VariableSizeList } from "react-window";
import { Card, Comp, View } from "medior/components";
import { Ingester, Reingester } from "medior/store";
import { getImportFolderHeight, ImportFolderList } from "./import-folder";

export interface ImportFoldersListProps {
  store: Ingester | Reingester;
}

export const ImportFoldersList = Comp(({ store }: ImportFoldersListProps) => {
  const listRef = useRef<VariableSizeList>();
  useEffect(() => {
    if (!store.isLoading) listRef.current?.resetAfterIndex(0);
  }, [store.isLoading]);

  const getByIndex = (index: number) => [...store.flatFolderHierarchy.values()][index];

  const getItemSize = (index: number) => {
    const folder = getByIndex(index);
    if (!folder) return 0;
    return 10 + getImportFolderHeight({ folder, withListItems: true });
  };

  return (
    <Card column flex={1}>
      <AutoSizer disableWidth style={{ paddingTop: "0.5rem" }}>
        {({ height }) => (
          <VariableSizeList
            ref={listRef}
            height={height}
            width="100%"
            itemCount={store.flatFolderHierarchy.size}
            itemSize={getItemSize}
          >
            {({ index, style }) => (
              <View style={style} padding={{ all: "0 0.5rem" }}>
                <ImportFolderList folder={getByIndex(index)} noStatus />
              </View>
            )}
          </VariableSizeList>
        )}
      </AutoSizer>
    </Card>
  );
});
