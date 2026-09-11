import { useCallback, useEffect, useMemo, useRef } from "react";
import AutoSizer from "react-virtualized-auto-sizer";
import { VariableSizeList } from "react-window";
import { Card, Comp, Pagination, View } from "medior/components";
import { Ingester, Reingester } from "medior/store";
import { getImportFolderHeight, ImportFolderList } from "./import-folder";

const FOLDER_GAP = 10;
const PAGINATION_HEIGHT = 56;

export interface ImportFoldersListProps {
  store: Ingester | Reingester;
}

export const ImportFoldersList = Comp(({ store }: ImportFoldersListProps) => {
  const listRef = useRef<VariableSizeList>();

  const folders = useMemo(
    () => [...store.flatFolderHierarchy.values()],
    [store.flatFolderHierarchy],
  );

  const isPaged = store.folderTotalCount > store.folderPageSize;
  const spacerRowCount = isPaged ? 1 : 0;

  useEffect(() => {
    if (store.isLoading) return;
    listRef.current?.resetAfterIndex(0, true);
    listRef.current?.scrollTo(0);
  }, [folders, store.isLoading]);

  const getByIndex = useCallback((index: number) => folders[index], [folders]);

  const getItemSize = useCallback(
    (index: number) => {
      const folder = getByIndex(index);
      if (!folder) return isPaged ? PAGINATION_HEIGHT : 0;
      return FOLDER_GAP + getImportFolderHeight({ folder, withListItems: true });
    },
    [getByIndex, isPaged],
  );

  return (
    <Card column flex={1}>
      <AutoSizer disableWidth style={{ paddingTop: "0.5rem" }}>
        {({ height }) => (
          <VariableSizeList
            ref={listRef}
            height={height}
            width="100%"
            itemCount={folders.length + spacerRowCount}
            itemSize={getItemSize}
            itemKey={(index) => getByIndex(index)?.folderName ?? index}
          >
            {({ index, style }) => {
              const folder = getByIndex(index);

              return (
                <View style={style} padding={{ all: "0 0.5rem" }}>
                  {folder && <ImportFolderList folder={folder} noStatus />}
                </View>
              );
            }}
          </VariableSizeList>
        )}
      </AutoSizer>

      {isPaged && (
        <Pagination
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
