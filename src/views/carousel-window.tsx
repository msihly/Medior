import { ipcRenderer } from "electron";
import remote from "@electron/remote";
import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import {
  Carousel,
  CarouselContext,
  CarouselThumbNavigator,
  CarouselTopBar,
  Tagger,
  View,
} from "components";
import { debounce, makeClasses, setupSocketIO, socket } from "utils";
import { toast } from "react-toastify";

export const CarouselWindow = observer(() => {
  const { fileStore, tagStore } = useStores();

  const { css } = useClasses(null);

  const panZoomRef = useRef(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const [activeFileId, setActiveFileId] = useState<string>(null);
  const [isTaggerOpen, setIsTaggerOpen] = useState(false);
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);

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

        setActiveFileId(fileId);
        setSelectedFileIds(selectedFileIds);

        rootRef.current?.focus();

        socket.on("filesDeleted", ({ fileIds }) => {
          setSelectedFileIds((prev) => prev.filter((id) => !fileIds.includes(id)));

          const newSelectedIds = selectedFileIds.filter((id) => !fileIds.includes(id));

          if (fileIds.includes(activeFileId)) {
            const nextIndex = selectedFileIds.indexOf(activeFileId) + 1;
            if (!newSelectedIds.length) return remote.getCurrentWindow().close();
            else if (nextIndex <= newSelectedIds.length) setActiveFileId(newSelectedIds[nextIndex]);
            else setActiveFileId(newSelectedIds[0]);
          }

          fileStore.loadFiles({ fileIds: newSelectedIds });
        });

        socket.on("fileTagsUpdated", ({ addedTagIds, fileIds, removedTagIds }) =>
          fileStore.updateFileTags({ addedTagIds, fileIds, removedTagIds })
        );

        socket.on("filesUpdated", ({ fileIds, updates }) =>
          fileStore.updateFiles(fileIds, updates)
        );

        socket.on("tagCreated", () => tagStore.loadTags());

        socket.on("tagDeleted", () => tagStore.loadTags());

        socket.on("tagUpdated", () => tagStore.loadTags());
      }
    );
  }, []);

  const handleScroll = (event) => debounce(handleNav, 100)(event.deltaY < 0);

  const handleNav = (isLeft: boolean) => {
    const activeFileIndex = selectedFileIds.findIndex((id) => id === activeFileId);
    if (activeFileIndex === (isLeft ? 0 : selectedFileIds.length - 1)) return;
    setActiveFileId(selectedFileIds[activeFileIndex + (isLeft ? -1 : 1)]);
    rootRef.current?.focus();
  };

  const handleKeyPress = async (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key === "t" && !isTaggerOpen) {
      e.preventDefault();
      setIsTaggerOpen(true);
    } else if (["ArrowLeft", "ArrowRight"].includes(e.key)) handleNav(e.key === "ArrowLeft");
    else if (["1", "2", "3", "4", "5", "6", "7", "8", "9"].includes(e.key)) {
      const res = await fileStore.setFileRating({ fileIds: [activeFileId], rating: +e.key });
      if (res.success) toast.success("Rating updated");
      else toast.error("Error updating rating");
    }
  };

  return (
    <CarouselContext.Provider
      value={{ activeFileId, panZoomRef, selectedFileIds, setActiveFileId }}
    >
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

        {isTaggerOpen && <Tagger fileIds={[activeFileId]} setVisible={setIsTaggerOpen} />}
      </View>
    </CarouselContext.Provider>
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
