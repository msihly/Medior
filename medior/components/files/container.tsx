import { useEffect, useRef } from "react";
import { observer, useStores } from "medior/store";
import { useHotkeys } from "medior/views";
import { CardGrid, Pagination } from "medior/components";
import { FileCard } from ".";
import { makeClasses, socket } from "medior/utils";

export const FileContainer = observer(() => {
  const { css } = useClasses(null);

  const stores = useStores();

  const filesRef = useRef<HTMLDivElement>(null);

  const { handleKeyPress } = useHotkeys({ view: "home" });

  const scrollToTop = () => filesRef.current?.scrollTo({ top: 0, behavior: "smooth" });

  useEffect(() => {
    if (stores.file.search.page > stores.file.search.pageCount)
      handlePageChange(stores.file.search.pageCount);
    scrollToTop();
  }, [stores.file.search.page, stores.file.search.pageCount]);

  useEffect(() => {
    socket.on("filesUpdated", ({ updates }) => {
      const updatedKeys = Object.keys(updates);
      const archivedOrTagsEdited = updatedKeys.some((k) => ["isArchived", "tagIds"].includes(k));
      const sortValueEdited = updatedKeys.includes(stores.file.search.sortValue.key);
      if (archivedOrTagsEdited || sortValueEdited) scrollToTop();
    });
  }, []);

  const handlePageChange = (page: number) => stores.file.search.loadFilteredFiles({ page });

  return (
    <CardGrid
      ref={filesRef}
      cards={stores.file.files.map((f, i) => (
        <FileCard key={i} file={f} />
      ))}
      cardsProps={{ onKeyDown: handleKeyPress, tabIndex: 1 }}
      className={css.cardGrid}
    >
      <Pagination
        count={stores.file.search.pageCount}
        page={stores.file.search.page}
        onChange={handlePageChange}
      />
    </CardGrid>
  );
});

const useClasses = makeClasses({
  cardGrid: {
    backgroundColor: "rgba(0, 0, 0, 0.35)",
  },
});
