import { useEffect, useRef } from "react";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { Pagination } from "@mui/material";
import { useHotkeys } from "views";
import { View } from "components";
import { DisplayedFiles } from ".";
import { colors, makeClasses, socket } from "utils";
import Color from "color";

export const FileContainer = observer(() => {
  const stores = useStores();

  const { css } = useClasses({ hasFiles: stores.file.files.length > 0 });

  const filesRef = useRef<HTMLDivElement>(null);

  const { handleKeyPress } = useHotkeys({ view: "home" });

  const scrollToTop = () => filesRef.current?.scrollTo({ top: 0, behavior: "smooth" });

  useEffect(() => {
    if (stores.file.page > stores.file.pageCount) handlePageChange(null, stores.file.pageCount);
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

  const handlePageChange = (_, page: number) => stores.home.loadFilteredFiles({ page });

  return (
    <View className={css.container}>
      <View ref={filesRef} onKeyDown={handleKeyPress} tabIndex={1} className={css.files}>
        <DisplayedFiles />
      </View>

      <Pagination
        count={stores.file.pageCount}
        page={stores.file.page}
        onChange={handlePageChange}
        showFirstButton
        showLastButton
        siblingCount={2}
        boundaryCount={2}
        className={css.pagination}
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
    overflowY: "auto",
  },
  files: {
    display: "flex",
    flexFlow: "row wrap",
    paddingBottom: "7rem",
    overflowY: "auto",
    ...(!hasFiles ? { height: "-webkit-fill-available" } : {}),
  },
  pagination: {
    position: "absolute",
    bottom: "0.5rem",
    left: 0,
    right: 0,
    borderRight: `3px solid ${colors.blue["800"]}`,
    borderLeft: `3px solid ${colors.blue["800"]}`,
    borderRadius: "0.5rem",
    margin: "0 auto 1rem",
    padding: "0.3rem",
    width: "fit-content",
    background: `linear-gradient(to top, ${colors.grey["900"]}, ${Color(colors.grey["900"])
      .darken(0.1)
      .string()})`,
  },
}));
