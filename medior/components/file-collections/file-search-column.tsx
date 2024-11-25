import { observer, useStores } from "medior/store";
import {
  Card,
  CardGrid,
  FileFilterMenu,
  FileSearchFile,
  Pagination,
  View,
} from "medior/components";
import { colors } from "medior/utils";

export const FileSearchColumn = observer(() => {
  const stores = useStores();

  const handlePageChange = (page: number) =>
    stores.collection.editor.fileSearch.loadFiltered({ page });

  return (
    <Card column flex="none" height="100%" width="16rem" spacing="0.5rem" padding={{ all: 0 }}>
      <View column spacing="0.5rem" padding={{ all: "0.5rem" }}>
        <FileFilterMenu store={stores.collection.editor.fileSearch} color={colors.custom.black} />
      </View>

      <CardGrid
        cards={stores.collection.editor.fileSearch.results.map((f) => (
          <FileSearchFile key={f.id} file={f} />
        ))}
        maxCards={1}
      >
        <Pagination
          count={stores.collection.editor.fileSearch.pageCount}
          page={stores.collection.editor.fileSearch.page}
          isLoading={stores.collection.editor.search.isPageCountLoading}
          onChange={handlePageChange}
        />
      </CardGrid>
    </Card>
  );
});
