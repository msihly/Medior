import { useEffect, useRef } from "react";
import { CardGrid, Pagination } from "medior/components";
import { observer, useStores } from "medior/store";
import { colors } from "medior/utils/client";
import { socket } from "medior/utils/server";
import { useHotkeys } from "medior/views";
import { FileCard } from ".";

export const FileContainer = observer(() => {
  const stores = useStores();

  const filesRef = useRef<HTMLDivElement>(null);

  const { handleKeyPress } = useHotkeys({ view: "home" });

  const scrollToTop = () => filesRef.current?.scrollTo({ top: 0, behavior: "smooth" });

  useEffect(() => {
    if (stores.file.search.page > stores.file.search.pageCount)
      handlePageChange(stores.file.search.pageCount);
    scrollToTop();
  }, [stores.file.search.page]);

  useEffect(() => {
    socket.on("onFilesUpdated", ({ updates }) => {
      const updatedKeys = Object.keys(updates);
      const archivedOrTagsEdited = updatedKeys.some((k) => ["isArchived", "tagIds"].includes(k));
      const sortValueEdited = updatedKeys.includes(stores.file.search.sortValue.key);
      if (archivedOrTagsEdited || sortValueEdited) scrollToTop();
    });
  }, []);

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
