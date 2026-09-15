import {
  Button,
  Card,
  CardGrid,
  Comp,
  FileCard,
  FileFilter,
  MultiActionButton,
  Pagination,
  SearchLoadingOverlay,
  View,
} from "medior/components";
import { useStores } from "medior/store";
import { colors, toast } from "medior/utils/client";

export const FileSearchColumn = Comp(() => {
  const stores = useStores();
  const store = stores.collection.editor.fileSearch;

  const handleFullPageLoad = () => store.loadFiltered({ withFullCount: true });

  const handlePageChange = (page: number) => store.loadFiltered({ page });

  const handleAddSelected = async () => {
    const res = await stores.collection.editor.addFiles([...store.selectedIds]);
    if (!res.success) toast.error(res.error);
  };

  const handleDeselectAll = () => store.setSelectedIds([]);

  const handleSelectAll = () =>
    store.toggleSelected(store.results.map(({ id }) => ({ id, isSelected: true })));

  return (
    <Card
      column
      flex="none"
      height="100%"
      width="16rem"
      spacing="0.5rem"
      padding={{ all: 0 }}
      position="relative"
    >
      <SearchLoadingOverlay store={store} />

      <View column spacing="0.5rem" padding={{ all: "0.5rem" }}>
        <FileFilter.Menu store={store} color={colors.custom.black} />

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

          <MultiActionButton
            name="Deselect"
            tooltip="Deselect All Files"
            onClick={handleDeselectAll}
            disabled={!store.selectedIds.length}
          />

          <MultiActionButton
            name="SelectAll"
            tooltip="Select All Files in View"
            onClick={handleSelectAll}
            disabled={store.isLoading}
          />
        </View>
      </View>

      <CardGrid
        cards={store.results.map((f) => (
          <FileCard key={f.id} file={f} store={store} height="14rem" />
        ))}
        maxCards={1}
      >
        <Pagination
          count={store.pageCount}
          page={store.page}
          isLoading={store.isPageCountLoading && !store.isLoading}
          onChange={handlePageChange}
          onFullLoad={handleFullPageLoad}
          boundaryCount={0}
          siblingCount={0}
          size="small"
        />
      </CardGrid>
    </Card>
  );
});
