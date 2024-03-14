import { ipcRenderer } from "electron";
import { WheelEvent, useEffect, useRef } from "react";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { Carousel, CarouselThumbNavigator, CarouselTopBar, View, ZoomContext } from "components";
import { Views, useHotkeys, useSockets } from "./common";
import { debounce, makeClasses } from "utils";

export const CarouselWindow = observer(() => {
  const { css } = useClasses(null);

  const { carouselStore, fileStore, tagStore } = useStores();

  const panZoomRef = useRef(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const { handleKeyPress, navCarouselByArrowKey } = useHotkeys({ rootRef, view: "carousel" });

  const handleScroll = (event: WheelEvent) =>
    debounce(navCarouselByArrowKey, 100)(event.deltaY < 0);

  useSockets({ view: "carousel" });

  const mouseMoveTimeout = useRef<number | null>(null);

  const handleMouseMove = () => {
    if (mouseMoveTimeout.current) clearTimeout(mouseMoveTimeout.current);
    carouselStore.setIsMouseMoving(true);
    mouseMoveTimeout.current = window.setTimeout(() => carouselStore.setIsMouseMoving(false), 1000);
  };

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  useEffect(() => {
    document.title = "Medior // Carousel";

    ipcRenderer.on(
      "init",
      async (_, { fileId, selectedFileIds }: { fileId: string; selectedFileIds: string[] }) => {
        try {
          let perfStart = performance.now();

          await Promise.all([
            fileStore.loadFiles({ fileIds: selectedFileIds }),
            tagStore.loadTags(),
          ]);

          console.debug(`Data loaded into MobX in ${performance.now() - perfStart}ms.`);

          carouselStore.setActiveFileId(fileId);
          carouselStore.setSelectedFileIds(selectedFileIds);

          rootRef.current?.focus();
        } catch (err) {
          console.error(err);
        }
      }
    );
  }, []);

  return (
    <ZoomContext.Provider value={panZoomRef}>
      <View
        ref={rootRef}
        onKeyDown={handleKeyPress}
        onMouseMove={handleMouseMove}
        onWheel={handleScroll}
        tabIndex={-1}
        className={css.root}
      >
        <CarouselTopBar />

        <Carousel />

        <CarouselThumbNavigator />

        <Views.FileModals />

        <Views.TagModals view="carousel" />
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
