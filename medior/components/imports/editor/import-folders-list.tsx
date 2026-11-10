import { useCallback, useEffect, useMemo, useRef } from "react";
import { List, ListImperativeAPI, RowComponentProps } from "react-window";
import { Card, Comp, FlatFolder, Pagination, View } from "medior/components";
import { ImportEditorStore } from "medior/store";
import { getImportFolderHeight, ImportFolderList } from "./import-folder";

const FOLDER_GAP = 10;

export interface ImportFoldersListProps {
  store: ImportEditorStore;
}

export const ImportFoldersList = Comp(({ store }: ImportFoldersListProps) => {
  const listRef = useRef<ListImperativeAPI>(undefined);

  const folders = useMemo(
    () => [...store.flatFolderHierarchy.values()],
    [store.flatFolderHierarchy],
  );

  // Read here so renaming a program re-renders the rows showing its season titles.
  const collectionTitles = folders.map(store.getFolderCollectionTitle);

  const isPaged = store.folderTotalCount > store.folderPageSize;

  useEffect(() => {
    if (store.isLoading) return;

    listRef.current?.element?.scrollTo({ top: 0 });
  }, [folders, store.isLoading]);

  const getRowHeight = useCallback(
    (index: number) =>
      FOLDER_GAP + getImportFolderHeight({ folder: folders[index], withListItems: true }),
    [folders],
  );

  return (
    <Card flex={1} minHeight={0} overflow="hidden" padding={{ all: 0 }}>
      <View column flex={1} minHeight={0} padding={{ all: "0.5rem", top: "1rem" }}>
        <List
          listRef={listRef}
          rowComponent={FolderRow}
          rowCount={folders.length}
          rowHeight={getRowHeight}
          rowKey={getFolderRowKey}
          rowProps={{ collectionTitles, folders }}
        />
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

interface FolderRowProps {
  collectionTitles: string[];
  folders: FlatFolder[];
}

const FolderRow = ({
  collectionTitles,
  folders,
  index,
  style,
}: RowComponentProps<FolderRowProps>) => (
  <View style={style} padding={{ all: "0 0.5rem" }}>
    <ImportFolderList collectionTitle={collectionTitles[index]} folder={folders[index]} noStatus />
  </View>
);

const getFolderRowKey = (index: number, { folders }: FolderRowProps) => folders[index].folderName;
