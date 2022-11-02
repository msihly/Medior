import { useEffect, useRef } from "react";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import Selecto, { OnSelect } from "react-selecto";
import { Pagination, colors } from "@mui/material";
import { View } from "components";
import { DisplayedFiles } from ".";
import { $C, makeClasses } from "utils";
import { setFileRating } from "database";

export const FileContainer = observer(() => {
  const { css } = useClasses(null);
  const { fileStore, homeStore, tagStore } = useStores();

  const pageCount =
    homeStore.filteredFiles.length < $C.FILE_COUNT
      ? 1
      : Math.ceil(homeStore.filteredFiles.length / $C.FILE_COUNT);

  const selectRef = useRef(null);
  const selectoRef = useRef(null);

  useEffect(() => {
    if (homeStore.page > pageCount) homeStore.setPage(pageCount);
  }, [homeStore.page, pageCount]);

  useEffect(() => {
    if (fileStore.selected.length === 0) selectoRef.current?.setSelectedTargets?.([]);
  }, [fileStore.selected]);

  const handleKeyPress = (e) => {
    if (e.key === "t" && !tagStore.isTaggerOpen) {
      e.preventDefault();
      tagStore.setIsTaggerOpen(true);
    } else if (fileStore.selected.length === 1) {
      const selectedId = fileStore.selected[0].id;
      const indexOfSelected = homeStore.filteredFiles.findIndex((f) => f.id === selectedId);
      const nextIndex =
        indexOfSelected === homeStore.filteredFiles.length - 1 ? 0 : indexOfSelected + 1;
      const nextId = homeStore.filteredFiles[nextIndex].id;
      const prevIndex =
        indexOfSelected === 0 ? homeStore.filteredFiles.length - 1 : indexOfSelected - 1;
      const prevId = homeStore.filteredFiles[prevIndex].id;

      if (["ArrowLeft", "ArrowRight"].includes(e.key)) {
        const newId = e.key === "ArrowLeft" ? prevId : nextId;
        if (!homeStore.displayedFiles.find((f) => f.id === newId))
          homeStore.setPage(homeStore.page + 1 * (e.key === "ArrowLeft" ? -1 : 1));
        fileStore.toggleFilesSelected([selectedId], false);
        fileStore.toggleFilesSelected([newId], true);
      } else if (["1", "2", "3", "4", "5", "6", "7", "8", "9"].includes(e.key)) {
        setFileRating([selectedId], +e.key);
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
        const lastIndex = homeStore.displayedFiles.findIndex(
          (f) => f.id === fileStore.selected[fileStore.selected.length - 1]?.id
        );
        const addedIndex = homeStore.displayedFiles.findIndex((f) => f.id === addedIds[0]);
        const rangeIds = homeStore.displayedFiles
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
        <DisplayedFiles />
      </View>

      <Pagination
        count={pageCount}
        page={homeStore.page}
        onChange={(_, value) => homeStore.setPage(value)}
        showFirstButton
        showLastButton
        className={css.pagination}
      />
    </View>
  );
});

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
