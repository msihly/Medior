import { useEffect, useRef } from "react";
import { CardGrid, Comp, Pagination } from "medior/components";
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
    if (store.page > store.pageCount) handlePageChange(store.pageCount);
  }, [store.page, store.pageCount]);

  const handleFullPageLoad = () => store.loadFiltered({ withFullCount: true });

  const handlePageChange = (page: number) => store.loadFiltered({ page });

  const scrollToTop = () => filesRef.current?.scrollTo({ top: 0, behavior: "instant" });

  return (
    <CardGrid
      ref={filesRef}
      cards={store.results.map((f, i) => (
        <FileCard key={i} file={f} store={store} />
      ))}
      cardsProps={{ onKeyDown: handleKeyPress, tabIndex: 1 }}
      bgColor={colors.custom.black}
    >
      <Pagination
        count={store.pageCount}
        page={store.page}
        isLoading={store.isPageCountLoading && !store.isLoading}
        onChange={handlePageChange}
        onFullLoad={handleFullPageLoad}
      />
    </CardGrid>
  );
});
