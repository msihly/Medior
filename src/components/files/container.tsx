import { ipcRenderer } from "electron";
import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { sortFiles, useStores } from "store";
import Selecto, { OnDragStart, OnSelect } from "react-selecto";
import { Pagination, colors } from "@mui/material";
import { Tagger, View } from "components";
import { DisplayedFiles } from ".";
import { makeClasses } from "utils";
import { getDisplayedFiles } from "database";

export const FileContainer = observer(() => {
  const { css } = useClasses(null);

  const rootStore = useStores()
  const { fileStore, homeStore, tagStore } = useStores();

  const [isTaggerOpen, setIsTaggerOpen] = useState(false);

  const selectRef = useRef(null);
  const selectoRef = useRef(null);

  useEffect(() => {
    if (fileStore.page > fileStore.pageCount) fileStore.setPage(fileStore.pageCount);
  }, [fileStore.page, fileStore.pageCount]);

  useEffect(() => {
    if (!fileStore.selectedIds.length) selectoRef.current?.setSelectedTargets?.([]);
  }, [fileStore.selectedIds]);

  useEffect(() => {
    const reloadDisplayedFiles = async () => {
      const perfStart = performance.now();
      const { filtered } = await getDisplayedFiles(rootStore);
      console.debug(
        `Loaded ${filtered.length} filtered files into MobX in ${performance.now() - perfStart}ms.`
      );
    };

    reloadDisplayedFiles();
  }, [
    fileStore.page,
    homeStore.excludedTags,
    homeStore.includeDescendants,
    homeStore.includeTagged,
    homeStore.includeUntagged,
    homeStore.includedTags,
    homeStore.isArchiveOpen,
    homeStore.isSortDesc,
    homeStore.selectedImageTypes,
    homeStore.selectedVideoTypes,
    homeStore.sortKey,
    tagStore.tags,
  ]);

  const handleKeyPress = (e) => {
    if (e.key === "t" && !isTaggerOpen) {
      e.preventDefault();
      setIsTaggerOpen(true);
    } else if (fileStore.selected.length === 1) {
      const selectedId = fileStore.selected[0].id;
      const indexOfSelected = fileStore.files.findIndex((f) => f.id === selectedId);
      const nextIndex = indexOfSelected === fileStore.files.length - 1 ? 0 : indexOfSelected + 1;
      const nextId = fileStore.files[nextIndex].id;
      const prevIndex = indexOfSelected === 0 ? fileStore.files.length - 1 : indexOfSelected - 1;
      const prevId = fileStore.files[prevIndex].id;

      if (["ArrowLeft", "ArrowRight"].includes(e.key)) {
        const newId = e.key === "ArrowLeft" ? prevId : nextId;
        if (!fileStore.files.find((f) => f.id === newId))
          fileStore.setPage(fileStore.page + 1 * (e.key === "ArrowLeft" ? -1 : 1));

        fileStore.toggleFilesSelected([
          { id: selectedId, isSelected: false },
          { id: newId, isSelected: true },
        ]);
      } else if (["1", "2", "3", "4", "5", "6", "7", "8", "9"].includes(e.key)) {
        ipcRenderer.send("setFileRating", { fileIds: [selectedId], rating: +e.key });
      }
    }
  };

  const handleSelect = (event: OnDragStart | OnSelect) => {
    const curSelectedIds = event.currentTarget.getSelectedTargets().map((e) => e.id);

    if (event.inputEvent?.shiftKey) {
      const endId = fileStore.selectedIds[fileStore.selectedIds.length - 1];
      const endIndex = fileStore.filteredFileIds.indexOf(endId);

      const firstId = fileStore.selectedIds[0];
      const firstIndex = fileStore.filteredFileIds.indexOf(firstId);

      const selectedId = event.inputEvent?.path?.find((el) =>
        el.classList?.value?.includes?.("selectable")
      )?.id;
      const selectedIndex = fileStore.filteredFileIds.indexOf(selectedId);

      const selectedFiles = fileStore.filteredFileIds
        .slice(firstIndex, selectedIndex + 1)
        .map((id) => ({ id, isSelected: true }));
      const unselectedFiles = fileStore.filteredFileIds
        .slice(selectedIndex, endIndex + 1)
        .map((id) => ({ id, isSelected: false }));

      fileStore.toggleFilesSelected([...selectedFiles, ...unselectedFiles]);
      event.currentTarget.setSelectedTargets(
        selectedFiles.map((f) => document.getElementById(f.id))
      );
    } else if (curSelectedIds?.length > 0) {
      const toggledFiles = [
        ...curSelectedIds.map((id) => ({ id, isSelected: true })),
        ...fileStore.filteredFileIds.reduce((acc, cur) => {
          if (
            !event.inputEvent?.ctrlKey &&
            fileStore.getIsSelected(cur) &&
            !curSelectedIds.includes(cur)
          )
            acc.push({ id: cur, isSelected: false });
          return acc;
        }, [] as { id: string; isSelected: boolean }[]),
      ];

      fileStore.toggleFilesSelected(toggledFiles);
      event.currentTarget.setSelectedTargets(
        curSelectedIds.map((id) => document.getElementById(id))
      );
    }
  };

  const handleScroll = (e) => selectRef.current.scrollBy(e.direction[0] * 10, e.direction[1] * 10);

  return (
    <View className={css.container}>
      <Selecto
        ref={selectoRef}
        dragContainer={selectRef.current}
        onSelect={handleSelect}
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
        count={fileStore.pageCount}
        page={fileStore.page}
        onChange={(_, value) => fileStore.setPage(value)}
        showFirstButton
        showLastButton
        className={css.pagination}
      />

      {isTaggerOpen && <Tagger files={fileStore.selected} setVisible={setIsTaggerOpen} />}
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
