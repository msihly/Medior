import { useEffect, useRef } from "react";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import Selecto, { OnSelect } from "react-selecto";
import { Pagination, colors } from "@mui/material";
import { Text, View } from "components";
import { FileDetails, FileGrid } from ".";
import { makeClasses } from "utils";
import { setFileRating } from "database";

interface FileContainerProps {
  mode: "details" | "grid";
}

const FileContainer = observer(({ mode }: FileContainerProps) => {
  const { classes: css } = useClasses(null);
  const { fileStore } = useStores();

  const selectRef = useRef(null);
  const selectoRef = useRef(null);

  useEffect(() => {
    if (fileStore.page > fileStore.pageCount) fileStore.setPage(fileStore.pageCount);
  }, [fileStore, fileStore.page, fileStore.pageCount]);

  useEffect(() => {
    if (fileStore.selected.length === 0) selectoRef.current?.setSelectedTargets?.([]);
  }, [fileStore.selected]);

  const handleKeyPress = (e) => {
    if (fileStore.selected.length === 1) {
      const selectedId = fileStore.selected[0].id;
      const indexOfSelected = fileStore.filtered.findIndex((f) => f.id === selectedId);
      const nextIndex = indexOfSelected === fileStore.filtered.length - 1 ? 0 : indexOfSelected + 1;
      const nextId = fileStore.filtered[nextIndex].id;
      const prevIndex = indexOfSelected === 0 ? fileStore.filtered.length - 1 : indexOfSelected - 1;
      const prevId = fileStore.filtered[prevIndex].id;

      if (["ArrowLeft", "ArrowRight"].includes(e.key)) {
        fileStore.toggleFilesSelected([selectedId], false);
        fileStore.toggleFilesSelected([e.key === "ArrowLeft" ? prevId : nextId], true);
      } else if (["1", "2", "3", "4", "5", "6", "7", "8", "9"].includes(e.key)) {
        setFileRating(fileStore, [selectedId], +e.key);
      }
    }
  };

  const handleSelect = (e: OnSelect) => {
    const addedIds = e.added.map((f) => f.id);
    const removedIds = e.removed.map((f) => f.id);
    const hasAdded = addedIds.length > 0;
    const hasRemoved = removedIds.length > 0;
    const isShiftClick = e.inputEvent?.shiftKey;

    if (!hasAdded && !hasRemoved) {
      return fileStore.toggleFilesSelected(
        fileStore.selected.map((f) => f.id),
        false
      );
    }

    if (hasAdded) {
      if (isShiftClick) {
        const lastIndex = fileStore.displayed.findIndex((f) => f.id === fileStore.lastSelected?.id);
        const addedIndex = fileStore.displayed.findIndex((f) => f.id === addedIds[0]);
        const rangeIds = fileStore.displayed
          .slice(
            lastIndex > addedIndex ? addedIndex : lastIndex,
            (addedIndex > lastIndex ? addedIndex : lastIndex) + 1
          )
          .map((f) => f.id);

        fileStore.toggleFilesSelected(rangeIds, true);
      } else fileStore.toggleFilesSelected(addedIds, true);
    }

    if (hasRemoved) fileStore.toggleFilesSelected(removedIds, false);
  };

  const handleScroll = (e) => selectRef.current.scrollBy(e.direction[0] * 10, e.direction[1] * 10);

  return (
    <View className={css.container}>
      <Selecto
        ref={selectoRef}
        dragContainer={selectRef.current}
        onSelect={handleSelect}
        onSelectEnd={handleSelect}
        selectableTargets={[".selectable"]}
        continueSelect={false}
        toggleContinueSelect={[["ctrl"], ["shift"]]}
        hitRate={0}
        scrollOptions={{ container: selectRef.current, throttleTime: 15 }}
        onScroll={handleScroll}
      />

      <View ref={selectRef} onKeyDown={handleKeyPress} tabIndex={1} className={css.files}>
        {fileStore.displayed?.length > 0 ? (
          fileStore.displayed.map((f) =>
            mode === "details" ? (
              <FileDetails key={f.id} id={f.id} />
            ) : (
              <FileGrid key={f.id} id={f.id} />
            )
          )
        ) : (
          <View className={css.noResults}>
            <Text variant="h5">No results found</Text>
          </View>
        )}
      </View>

      <Pagination
        count={fileStore.pageCount}
        page={fileStore.page}
        onChange={(_, value) => fileStore.setPage(value)}
        showFirstButton
        showLastButton
        className={css.pagination}
      />
    </View>
  );
});

export default FileContainer;

const useClasses = makeClasses({
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
    paddingBottom: "3rem",
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
