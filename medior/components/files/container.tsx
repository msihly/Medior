import { useEffect, useRef } from "react";
import { CardGrid, Comp, Pagination } from "medior/components";
import { useStores } from "medior/store";
import { colors } from "medior/utils/client";
import { useHotkeys } from "medior/views";
import { FileCard } from ".";

export const FileContainer = Comp(() => {
  const stores = useStores();
  const store = stores.file.search;

  const filesRef = useRef<HTMLDivElement>(null);

  const { handleKeyPress } = useHotkeys({ view: "home" });

  useEffect(() => {
    scrollToTop();
    if (store.page > store.pageCount) handlePageChange(store.pageCount);
  }, [store.page, store.pageCount]);

  const handlePageChange = (page: number) => store.loadFiltered({ page });

  const scrollToTop = () => filesRef.current?.scrollTo({ top: 0, behavior: "instant" });

  return (
    <CardGrid
      ref={filesRef}
      cards={store.results.map((f, i) => (
        <FileCard key={i} file={f} />
      ))}
      cardsProps={{ onKeyDown: handleKeyPress, tabIndex: 1 }}
      bgColor={colors.custom.black}
    >
      <Pagination
        count={store.pageCount}
        page={store.page}
        isLoading={store.isPageCountLoading}
        onChange={handlePageChange}
      />
    </CardGrid>
  );
});
