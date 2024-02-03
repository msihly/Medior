import { ipcRenderer } from "electron";
import { useEffect, useRef } from "react";
import { SocketEmitEvent } from "server";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import {
  Carousel,
  CarouselThumbNavigator,
  CarouselTopBar,
  ConfirmModal,
  InfoModal,
  TagEditor,
  Tagger,
  View,
  ZoomContext,
} from "components";
import { debounce, makeClasses, setupSocketIO, socket } from "utils";
import { toast } from "react-toastify";

export const CarouselWindow = observer(() => {
  const { css } = useClasses(null);

  const rootStore = useStores();
  const { carouselStore, fileStore, tagStore } = useStores();

  const panZoomRef = useRef(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const handleDeleteFilesConfirm = async () => (await fileStore.deleteFiles({ rootStore })).success;

  const handleKeyPress = async (e: React.KeyboardEvent<HTMLElement>) => {
    if (carouselStore.isTaggerOpen) return;

    const fileIds = [carouselStore.activeFileId];
    if (e.key === "t") carouselStore.setIsTaggerOpen(true);
    else if (e.key === "Delete") fileStore.confirmDeleteFiles(fileIds);
    else if (["ArrowLeft", "ArrowRight"].includes(e.key)) handleNav(e.key === "ArrowLeft");
    else if (["1", "2", "3", "4", "5", "6", "7", "8", "9"].includes(e.key)) {
      const res = await fileStore.setFileRating({ fileIds, rating: +e.key });
      if (res.success) toast.success("Rating updated");
      else toast.error("Error updating rating");
    } else return;

    e.preventDefault();
  };

  const handleNav = (isLeft: boolean) => {
    if (carouselStore.activeFileIndex === (isLeft ? 0 : carouselStore.selectedFileIds.length - 1))
      return;

    carouselStore.setActiveFileId(
      carouselStore.selectedFileIds[carouselStore.activeFileIndex + (isLeft ? -1 : 1)]
    );

    rootRef.current?.focus();
  };

  const handleScroll = (event) => debounce(handleNav, 100)(event.deltaY < 0);

  const setDeleteFilesModalVisible = (val: boolean) => fileStore.setIsConfirmDeleteOpen(val);

  const setTaggerVisible = (val: boolean) => carouselStore.setIsTaggerOpen(val);

  useEffect(() => {
    document.title = "Media Viewer // Carousel";
    console.debug("Carousel window useEffect fired.");

    const loadDatabase = async (fileIds: string[]) => {
      let perfStart = performance.now();
      setupSocketIO();
      await Promise.all([fileStore.loadFiles({ fileIds }), tagStore.loadTags()]);
      console.debug(`Files and tags loaded into MobX in ${performance.now() - perfStart}ms.`);
    };

    ipcRenderer.on(
      "init",
      async (_, { fileId, selectedFileIds }: { fileId: string; selectedFileIds: string[] }) => {
        await loadDatabase(selectedFileIds);

        carouselStore.setActiveFileId(fileId);
        carouselStore.setSelectedFileIds(selectedFileIds);

        rootRef.current?.focus();

        ["filesArchived", "filesDeleted"].forEach((event: SocketEmitEvent) =>
          socket.on(event, ({ fileIds }) => carouselStore.removeFiles(fileIds))
        );

        socket.on("fileTagsUpdated", ({ addedTagIds, fileIds, removedTagIds }) =>
          fileStore.updateFileTags({ addedTagIds, fileIds, removedTagIds })
        );
        socket.on("filesUpdated", ({ fileIds, updates }) =>
          fileStore.updateFiles(fileIds, updates)
        );

        socket.on("reloadFiles", () => fileStore.loadFiles({ fileIds: selectedFileIds }));
        socket.on("reloadTags", () => tagStore.loadTags());

        socket.on("tagCreated", ({ tag }) => tagStore._addTag(tag));
        socket.on("tagDeleted", ({ tagId }) => tagStore._deleteTag(tagId));
        socket.on("tagsUpdated", (tags) =>
          tags.forEach((t) => tagStore.getById(t.tagId)?.update(t.updates))
        );
      }
    );
  }, []);

  return (
    <ZoomContext.Provider value={panZoomRef}>
      <View
        ref={rootRef}
        onWheel={handleScroll}
        onKeyDown={handleKeyPress}
        className={css.root}
        tabIndex={-1}
      >
        <CarouselTopBar />

        <Carousel />

        <CarouselThumbNavigator />

        {carouselStore.isTaggerOpen && (
          <Tagger fileIds={[carouselStore.activeFileId]} setVisible={setTaggerVisible} />
        )}

        {tagStore.isTagEditorOpen && <TagEditor id={tagStore.activeTagId} hasSubEditor />}

        {tagStore.isTagSubEditorOpen && <TagEditor id={tagStore.subEditorTagId} isSubEditor />}

        {fileStore.isInfoModalOpen && <InfoModal />}

        {fileStore.isConfirmDeleteOpen && (
          <ConfirmModal
            headerText="Delete Files"
            subText="Are you sure you want to delete these files?"
            setVisible={setDeleteFilesModalVisible}
            onConfirm={handleDeleteFilesConfirm}
          />
        )}
      </View>
    </ZoomContext.Provider>
  );
});

const useClasses = makeClasses({
  root: {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    overflow: "hidden",
    transition: "all 200ms ease-in-out",
  },
});
