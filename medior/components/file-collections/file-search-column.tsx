import {
  Card,
  CardGrid,
  Comp,
  FileFilter,
  FileSearchFile,
  Pagination,
  View,
} from "medior/components";
import { useStores } from "medior/store";
import { colors } from "medior/utils/client";

export const FileSearchColumn = Comp(() => {
  const stores = useStores();
  const store = stores.collection.editor.fileSearch;

  const handleFullPageLoad = () => store.loadFiltered({ withFullCount: true });

  const handlePageChange = (page: number) => store.loadFiltered({ page });

  return (
    <Card column flex="none" height="100%" width="16rem" spacing="0.5rem" padding={{ all: 0 }}>
      <View column spacing="0.5rem" padding={{ all: "0.5rem" }}>
        <FileFilter.Menu store={store} color={colors.custom.black} />
      </View>

      <CardGrid
        cards={store.results.map((f) => (
          <FileSearchFile key={f.id} file={f} />
        ))}
        maxCards={1}
      >
        <Pagination
          count={store.pageCount}
          page={store.page}
          isLoading={store.isPageCountLoading}
          onChange={handlePageChange}
          onFullLoad={handleFullPageLoad}
        />
      </CardGrid>
    </Card>
  );
});
