import { useEffect, useRef } from "react";
import { CardGrid, Comp, Pagination, View } from "medior/components";
import { useStores } from "medior/store";
import { colors } from "medior/utils/client";
import { useHotkeys } from "medior/views";
import { FileCard } from ".";

interface FileContainerProps {
  view: "home" | "search";
}

export const FileContainer = Comp(({ view }: FileContainerProps) => {
  const stores = useStores();
  const store = stores.file.search;

  const filesRef = useRef<HTMLDivElement>(null);

  const { handleKeyPress } = useHotkeys({ view });

  useEffect(() => {
    scrollToTop();
  }, [store.page, store.pageCount]);

  useEffect(() => {
    if (!store.isLoading && !store.isPageCountLoading && store.page > Math.max(store.pageCount, 1))
      handlePageChange(Math.max(store.pageCount, 1));
  }, [store.isLoading, store.isPageCountLoading, store.page, store.pageCount]);

  const handleFullPageLoad = () => store.loadFiltered({ toLastPage: true });

  const handlePageChange = (page: number) => store.loadFiltered({ page });

  const scrollToTop = () => filesRef.current?.scrollTo({ behavior: "instant", top: 0 });

  return (
    <View column flex={1} minHeight={0} overflow="hidden">
      <CardGrid
        padding={{ all: "0.3rem" }}
        ref={filesRef}
        cards={store.results.map((f, i) => (
          <FileCard key={i} file={f} store={store} />
        ))}
        cardsProps={{ onKeyDown: handleKeyPress, tabIndex: 1 }}
        bgColor={colors.custom.black}
      />

      <Pagination
        inline
        count={store.pageCount}
        page={store.page}
        isLoading={store.isPageCountLoading && !store.isLoading}
        onChange={handlePageChange}
        onFullLoad={handleFullPageLoad}
      />
    </View>
  );
});
