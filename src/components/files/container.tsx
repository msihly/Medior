import { useMemo, useRef, useState } from "react";
import Selecto from "react-selecto";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { File } from "store/files";
import { Pagination, colors } from "@mui/material";
import { Text } from "components/text";
import { FileDetails, FileGrid } from ".";
import { makeStyles } from "utils";

const ROW_COUNT = 20;

interface FileContainerProps {
  files: File[];
  mode: "details" | "grid";
}

const FileContainer = observer(({ files, mode }: FileContainerProps) => {
  const { fileStore } = useStores();

  const { classes: css } = useClasses();

  const selectRef = useRef(null);

  const handleSelect = (e) => {
    fileStore.toggleFilesSelected(
      e.added.map((f) => f.id),
      true
    );

    fileStore.toggleFilesSelected(
      e.removed.map((f) => f.id),
      false
    );
  };

  const handleScroll = (e) => {
    selectRef.current.scrollBy(e.direction[0] * 10, e.direction[1] * 10);
  };

  const [page, setPage] = useState(1);
  const displayed = useMemo(() => {
    return files.slice((page - 1) * ROW_COUNT, page * ROW_COUNT);
  }, [files, page]);

  return (
    <div className={css.container}>
      <Selecto
        dragContainer={selectRef.current}
        onSelect={handleSelect}
        selectableTargets={[".selectable"]}
        continueSelect={true}
        hitRate={0}
        scrollOptions={{ container: selectRef.current, throttleTime: 15 }}
        onScroll={handleScroll}
      />

      <div ref={selectRef} className={css.files}>
        {displayed?.length > 0 ? (
          displayed.map((f) =>
            mode === "details" ? (
              <FileDetails key={f.id} file={f} />
            ) : (
              <FileGrid key={f.id} id={f.id} file={f} />
            )
          )
        ) : (
          <div className={css.noResults}>
            <Text variant="h5">No results found</Text>
          </div>
        )}
      </div>

      <Pagination
        count={
          fileStore.filtered.length < ROW_COUNT
            ? 1
            : Math.ceil(fileStore.filtered.length / ROW_COUNT)
        }
        page={page}
        onChange={(_, value) => setPage(value)}
        showFirstButton
        showLastButton
        className={css.pagination}
      />
    </div>
  );
});

export default FileContainer;

const useClasses = makeStyles()({
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
    overflowY: "auto",
  },
  noResults: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
  },
  pagination: {
    position: "absolute",
    bottom: "0.5rem",
    left: 0,
    right: 0,
    borderRadius: "2rem",
    margin: "0 auto",
    padding: "0.3rem",
    width: "fit-content",
    backgroundColor: colors.grey["900"],
  },
});
