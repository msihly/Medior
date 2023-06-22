import { ipcRenderer } from "electron";
import { useEffect, useRef, useState } from "react";
import Mongoose from "mongoose";
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
import { debounce, makeClasses, trpc } from "utils";

export const CarouselWindow = observer(() => {
  const { fileStore, tagStore } = useStores();

  const { css } = useClasses(null);

  const panZoomRef = useRef(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const [activeFileId, setActiveFileId] = useState<string>(null);
  const [isTaggerOpen, setIsTaggerOpen] = useState(false);
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);

  const file = activeFileId ? fileStore.getById(activeFileId) : null;

  useEffect(() => {
    document.title = "Media Viewer // Carousel";
    console.debug("Carousel window useEffect fired.");

    const loadDatabase = async (fileIds: string[]) => {
      let perfStart = performance.now();

      const [filesRes, tagsRes] = await Promise.all([
        trpc.listFiles.mutate({ ids: fileIds }),
        trpc.listTags.mutate(),
      ]);
      if (filesRes.success) fileStore.overwrite(filesRes.data);
      if (tagsRes.success) tagStore.overwrite(tagsRes.data);

      console.debug(`Files and tags loaded into MobX in ${performance.now() - perfStart}ms.`);
    };

    ipcRenderer.on(
      "init",
      async (_, { fileId, selectedFileIds }: { fileId: string; selectedFileIds: string[] }) => {
        await loadDatabase(selectedFileIds);
        setActiveFileId(fileId);
        setSelectedFileIds(selectedFileIds);
      }
    );

    rootRef.current?.focus();

    return () => {
      Mongoose.disconnect();
    };
  }, []);

  const handleScroll = (event) => debounce(handleNav, 100)(event.deltaY < 0);

  const handleNav = (isLeft: boolean) => {
    const activeFileIndex = selectedFileIds.findIndex((id) => id === activeFileId);
    if (activeFileIndex === (isLeft ? 0 : selectedFileIds.length - 1)) return;
    setActiveFileId(selectedFileIds[activeFileIndex + (isLeft ? -1 : 1)]);
    rootRef.current?.focus();
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key === "t" && !isTaggerOpen) {
      e.preventDefault();
      setIsTaggerOpen(true);
    } else if (["ArrowLeft", "ArrowRight"].includes(e.key)) handleNav(e.key === "ArrowLeft");
    else if (["1", "2", "3", "4", "5", "6", "7", "8", "9"].includes(e.key))
      ipcRenderer.send("setFileRating", { fileIds: [activeFileId], rating: +e.key });
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

        {isTaggerOpen && <Tagger files={[file]} setVisible={setIsTaggerOpen} />}
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
