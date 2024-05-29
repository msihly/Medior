import { useEffect, useRef } from "react";
import { observer, useStores } from "store";
import { useHotkeys } from "views";
import { Pagination, View } from "components";
import { DisplayedFiles } from ".";
import { makeClasses, socket } from "utils";

export const FileContainer = observer(() => {
  const stores = useStores();

  const { css } = useClasses({ hasFiles: stores.file.files.length > 0 });

  const filesRef = useRef<HTMLDivElement>(null);

  const { handleKeyPress } = useHotkeys({ view: "home" });

  const scrollToTop = () => filesRef.current?.scrollTo({ top: 0, behavior: "smooth" });

  useEffect(() => {
    if (stores.file.page > stores.file.pageCount) handlePageChange(stores.file.pageCount);
    scrollToTop();
  }, [stores.file.page, stores.file.pageCount]);

  useEffect(() => {
    socket.on("filesUpdated", ({ updates }) => {
      const updatedKeys = Object.keys(updates);
      const archivedOrTagsEdited = updatedKeys.some((k) => ["isArchived", "tagIds"].includes(k));
      const sortValueEdited = updatedKeys.includes(stores.home.sortValue.key);
      if (archivedOrTagsEdited || sortValueEdited) scrollToTop();
    });
  }, []);

  const handlePageChange = (page: number) => stores.home.loadFilteredFiles({ page });

  return (
    <View className={css.container}>
      <View ref={filesRef} onKeyDown={handleKeyPress} tabIndex={1} className={css.files}>
        <DisplayedFiles />
      </View>

      <Pagination
        count={stores.file.pageCount}
        page={stores.file.page}
        onChange={handlePageChange}
      />
    </View>
  );
});

interface ClassesProps {
  hasFiles: boolean;
}

const useClasses = makeClasses((_, { hasFiles }: ClassesProps) => ({
  container: {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.35)",
    overflowY: "auto",
  },
  files: {
    display: "flex",
    flexFlow: "row wrap",
    paddingBottom: "7rem",
    overflowY: "auto",
    ...(!hasFiles ? { height: "-webkit-fill-available" } : {}),
  },
}));
