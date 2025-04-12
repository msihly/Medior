import { useEffect, useRef } from "react";
import AutoSizer from "react-virtualized-auto-sizer";
import { VariableSizeList } from "react-window";
import {
  Card,
  Comp,
  FlatFolderHierarchy,
  getImportFolderHeight,
  ImportFolderList,
  View,
} from "medior/components";
import { useStores } from "medior/store";

export interface ImportFoldersListProps {
  flatFolderHierarchy: FlatFolderHierarchy;
}

export const ImportFoldersList = Comp(({ flatFolderHierarchy }: ImportFoldersListProps) => {
  const stores = useStores();

  const listRef = useRef<VariableSizeList>();
  useEffect(() => {
    if (!stores.import.editor.isLoading) listRef.current?.resetAfterIndex(0);
  }, [stores.import.editor.isLoading]);

  const getByIndex = (index: number) => [...flatFolderHierarchy.values()][index];

  const getItemSize = (index: number) => {
    const folder = getByIndex(index);
    if (!folder) return 0;
    return 10 + getImportFolderHeight(folder);
  };

  return (
    <Card column flex={1}>
      <AutoSizer disableWidth style={{ paddingTop: "0.5rem" }}>
        {({ height }) => (
          <VariableSizeList
            ref={listRef}
            height={height}
            width="100%"
            itemCount={flatFolderHierarchy.size}
            itemSize={getItemSize}
          >
            {({ index, style }) => (
              <View style={style} padding={{ all: "0 0.5rem" }}>
                <ImportFolderList folder={getByIndex(index)} />
              </View>
            )}
          </VariableSizeList>
        )}
      </AutoSizer>
    </Card>
  );
});
