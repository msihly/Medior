import { useEffect, useRef } from "react";
import { CardGrid, Comp, Pagination } from "medior/components";
import { useStores } from "medior/store";
import { colors } from "medior/utils/client";
import { useHotkeys } from "medior/views";
import { FileCard } from ".";

export const FileContainer = Comp(() => {
  const stores = useStores();

  const filesRef = useRef<HTMLDivElement>(null);

  const { handleKeyPress } = useHotkeys({ view: "home" });

  const scrollToTop = () => filesRef.current?.scrollTo({ top: 0, behavior: "smooth" });

  useEffect(() => {
    if (stores.file.search.page > stores.file.search.pageCount)
      handlePageChange(stores.file.search.pageCount);
    scrollToTop();
  }, [stores.file.search.page]);

  const handlePageChange = (page: number) => stores.file.search.loadFiltered({ page });

  return (
    <CardGrid
      ref={filesRef}
      cards={stores.file.search.results.map((f, i) => (
        <FileCard key={i} file={f} />
      ))}
      cardsProps={{ onKeyDown: handleKeyPress, tabIndex: 1 }}
      bgColor={colors.custom.black}
    >
      <Pagination
        count={stores.file.search.pageCount}
        page={stores.file.search.page}
        isLoading={stores.file.search.isPageCountLoading}
        onChange={handlePageChange}
      />
    </CardGrid>
  );
});
