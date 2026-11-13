import { useEffect, useRef } from "react";
import {
  Button,
  Card,
  CardGrid,
  Comp,
  DeselectAllButton,
  FileCard,
  FileFilter,
  Pagination,
  SearchLoadingOverlay,
  SelectAllButton,
  View,
} from "medior/components";
import { useStores } from "medior/store";
import { colors, toast } from "medior/utils/client";

export const FileSearchColumn = Comp(() => {
  const stores = useStores();
  const store = stores.collection.editor.fileSearch;

  const filesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    filesRef.current?.scrollTo({ behavior: "instant", top: 0 });
  }, [store.page, store.pageCount]);

  const handleFullPageLoad = () => store.loadFiltered({ toLastPage: true });

  const handlePageChange = (page: number) => store.loadFiltered({ page });

  const handleAddSelected = async () => {
    const res = await stores.collection.editor.addFiles([...store.selectedIds]);
    if (!res.success) toast.error(res.error);
  };

  return (
    <Card flex="none" height="100%" width="16rem" overflow="hidden" padding={{ all: 0 }}>
      <SearchLoadingOverlay store={store} />

      <View column spacing="0.5rem" padding={{ all: "0.5rem" }}>
        <FileFilter.Menu store={store} />

        <View row align="center" spacing="0.3rem">
          <Button
            text={`Add ${store.selectedIds.length} Selected`}
            icon="Add"
            onClick={handleAddSelected}
            disabled={
              store.isLoading || stores.collection.editor.isLoading || !store.selectedIds.length
            }
            color={colors.custom.green}
            width="100%"
          />

          <DeselectAllButton itemLabel="files" store={store} toast={toast} />

          <SelectAllButton
            itemLabel="files"
            store={store}
            toast={toast}
            disabled={store.isLoading}
          />
        </View>
      </View>

      <CardGrid
        padding={{ all: "0.3rem" }}
        ref={filesRef}
        cards={store.results.map((f) => (
          <FileCard key={f.id} file={f} store={store} height="14rem" />
        ))}
        maxCards={1}
      />

      <Pagination
        inline
        count={store.pageCount}
        page={store.page}
        isLoading={store.isPageCountLoading && !store.isLoading}
        onChange={handlePageChange}
        onFullLoad={handleFullPageLoad}
        boundaryCount={0}
        siblingCount={0}
        size="small"
      />
    </Card>
  );
});
