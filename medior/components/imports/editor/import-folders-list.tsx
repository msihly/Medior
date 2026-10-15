import { useCallback, useEffect, useMemo, useRef } from "react";
import AutoSizer from "react-virtualized-auto-sizer";
import { VariableSizeList } from "react-window";
import { Card, Comp, Pagination, View } from "medior/components";
import { Ingester, Reingester } from "medior/store";
import { getImportFolderHeight, ImportFolderList } from "./import-folder";

const FOLDER_GAP = 10;

export interface ImportFoldersListProps {
  store: Ingester | Reingester;
}

export const ImportFoldersList = Comp(({ store }: ImportFoldersListProps) => {
  const listRef = useRef<VariableSizeList>();

  const folders = useMemo(
    () => [...store.flatFolderHierarchy.values()],
    [store.flatFolderHierarchy],
  );

  // Read here so renaming a program re-renders the rows showing its season titles.
  const collectionTitles = folders.map(store.getFolderCollectionTitle);

  const isPaged = store.folderTotalCount > store.folderPageSize;

  useEffect(() => {
    if (store.isLoading) return;

    listRef.current?.resetAfterIndex(0, true);
    listRef.current?.scrollTo(0);
  }, [folders, store.isLoading]);

  const getItemSize = useCallback(
    (index: number) =>
      FOLDER_GAP + getImportFolderHeight({ folder: folders[index], withListItems: true }),
    [folders],
  );

  return (
    <Card flex={1} minHeight={0} overflow="hidden" padding={{ all: 0 }}>
      <View flex={1} minHeight={0} padding={{ all: "0.5rem", top: "1rem" }}>
        <AutoSizer disableWidth>
          {({ height }) => (
            <VariableSizeList
              ref={listRef}
              height={height}
              width="100%"
              itemCount={folders.length}
              itemSize={getItemSize}
              itemKey={(index) => folders[index].folderName}
            >
              {({ index, style }) => (
                <View style={style} padding={{ all: "0 0.5rem" }}>
                  <ImportFolderList
                    collectionTitle={collectionTitles[index]}
                    folder={folders[index]}
                    noStatus
                  />
                </View>
              )}
            </VariableSizeList>
          )}
        </AutoSizer>
      </View>

      {isPaged && (
        <Pagination
          inline
          count={store.folderPageCount}
          page={store.folderPage + 1}
          isLoading={store.isLoading}
          onChange={store.setFolderPageFromPagination}
          siblingCount={2}
        />
      )}
    </Card>
  );
});
