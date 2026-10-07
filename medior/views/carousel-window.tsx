import { ipcRenderer } from "electron";
import { createContext, MutableRefObject, useEffect, useMemo, useRef, WheelEvent } from "react";
import FilePlayer from "react-player/file";
import { PanzoomObject } from "@panzoom/panzoom";
import {
  Carousel,
  CarouselThumbNavigator,
  CarouselTopBar,
  Comp,
  View,
  WindowTitleBar,
} from "medior/components";
import { useStores } from "medior/store";
import { makeClasses, toast } from "medior/utils/client";
import { debounce } from "medior/utils/common";
import { zoomScaleStepIn, zoomScaleStepOut } from "medior/utils/server";
import { useHotkeys, useSockets, Views } from "medior/views/common";

export const VideoContext = createContext<MutableRefObject<FilePlayer>>(null);

export const ZoomContext = createContext<MutableRefObject<PanzoomObject>>(null);

export interface CarouselWindowProps {
  embedded?: boolean;
}

export const CarouselWindow = Comp(({ embedded = false }: CarouselWindowProps) => {
  const stores = useStores();
  const store = stores.carousel;

  const { css } = useClasses(null);

  const mouseMoveTimeout = useRef<number | null>(null);
  const panZoomRef = useRef<PanzoomObject>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<FilePlayer>(null);

  const activeFile = store.getActiveFile();
  const title = activeFile
    ? `Medior — ${activeFile.originalName}${
        store.selectedFileIds.length
          ? ` — (${store.activeFileIndex + 1} / ${store.selectedFileIds.length})`
          : ""
      }`
    : "Medior";

  const setRootRef = (ref: HTMLDivElement) => {
    rootRef.current = ref;
    ref?.focus();
  };

  const { handleKeyPress, navCarouselByArrowKey } = useHotkeys({
    rootRef,
    videoRef,
    view: "carousel",
  });

  const navigateOnScroll = useMemo(
    () =>
      debounce((isLeft: boolean) => {
        if (
          !store.splicer.isOpen &&
          !stores.file.isInfoModalOpen &&
          !stores._getIsBlockingModalOpen()
        )
          navCarouselByArrowKey(isLeft);
      }, 100),
    [store, stores],
  );

  useEffect(() => () => navigateOnScroll.cancel(), [navigateOnScroll]);

  const handleScroll = (event: WheelEvent) => {
    if (store.splicer.isOpen || stores.file.isInfoModalOpen || stores._getIsBlockingModalOpen())
      return;

    if (!event.ctrlKey) navigateOnScroll(event.deltaY < 0);
    else {
      if (!panZoomRef.current) return console.error("Panzoom ref not set");

      const curScale = panZoomRef.current.getScale();
      const newScale = event.deltaY > 0 ? zoomScaleStepOut(curScale) : zoomScaleStepIn(curScale);

      panZoomRef.current.zoomToPoint(newScale, { clientX: event.clientX, clientY: event.clientY });
    }
  };

  useSockets({ enabled: !embedded, view: "carousel" });

  const handleMouseMove = () => {
    if (mouseMoveTimeout.current) clearTimeout(mouseMoveTimeout.current);

    store.setIsMouseMoving(true);
    mouseMoveTimeout.current = window.setTimeout(() => store.setIsMouseMoving(false), 1000);
  };

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove);

    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  useEffect(() => {
    if (embedded) return;

    const initialize = (
      _,
      { fileId, selectedFileIds }: { fileId: string; selectedFileIds: string[] },
    ) => {
      store.setSelectedFileIds([
        ...new Set(
          selectedFileIds.includes(fileId) ? selectedFileIds : [fileId, ...selectedFileIds],
        ),
      ]);
      store.setVisibleFileIds([]);
      store.setActiveFileId(fileId);
      stores.file.setActiveFileId(fileId);
    };

    ipcRenderer.on("init", initialize);

    return () => {
      ipcRenderer.removeListener("init", initialize);
    };
  }, [embedded]);

  useEffect(() => {
    let cancelled = false;

    const loadFiles = async () => {
      try {
        const result = await store.loadFiles();

        if (!cancelled && !result.success) toast.error(result.error);
      } catch (error) {
        if (!cancelled) toast.error(error.message);
      }
    };

    if (store.activeFileId) loadFiles();

    return () => {
      cancelled = true;
      stores.file.search.cancelLoad();
    };
  }, [store.activeFileId, store.selectedFileIds, store.visibleFileIds]);

  return (
    <ZoomContext.Provider value={panZoomRef}>
      <VideoContext.Provider value={videoRef}>
        <View
          ref={setRootRef}
          onKeyDown={handleKeyPress}
          onMouseMove={handleMouseMove}
          onWheel={handleScroll}
          column
          height={embedded ? "100%" : "100vh"}
          position="relative"
          overflow="hidden"
          tabIndex={-1}
          className={css.root}
        >
          {!embedded && <WindowTitleBar isDark {...{ title }} />}

          <View column flex={1} overflow="hidden" position="relative">
            <CarouselTopBar />

            <Carousel ref={videoRef} />

            {!stores.carousel.splicer.isOpen && <CarouselThumbNavigator />}

            {!embedded && <Views.FileModals />}

            <Views.TagModals view="carousel" />
          </View>
        </View>
      </VideoContext.Provider>
    </ZoomContext.Provider>
  );
});

const useClasses = makeClasses({
  root: {
    transition: "all 200ms ease-in-out",
  },
});
