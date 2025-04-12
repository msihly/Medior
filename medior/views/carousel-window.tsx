import { ipcRenderer } from "electron";
import { createContext, MutableRefObject, useEffect, useRef, WheelEvent } from "react";
import FilePlayer from "react-player/file";
import { PanzoomObject } from "@panzoom/panzoom";
import { Carousel, CarouselThumbNavigator, CarouselTopBar, View } from "medior/components";
import { observer, useStores } from "medior/store";
import { makeClasses, zoomScaleStepIn, zoomScaleStepOut } from "medior/utils/client";
import { debounce } from "medior/utils/common";
import { makePerfLog } from "medior/utils/server";
import { useHotkeys, useSockets, Views } from "medior/views/common";

export const VideoContext = createContext<MutableRefObject<FilePlayer>>(null);

export const ZoomContext = createContext<MutableRefObject<PanzoomObject>>(null);

export const CarouselWindow = observer(() => {
  const { css } = useClasses(null);

  const stores = useStores();

  const panZoomRef = useRef<PanzoomObject>(null);
  const videoRef = useRef<FilePlayer>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const setRootRef = (ref: HTMLDivElement) => {
    rootRef.current = ref;
    ref?.focus();
  };

  const { handleKeyPress, navCarouselByArrowKey } = useHotkeys({
    rootRef,
    videoRef,
    view: "carousel",
  });

  const handleScroll = (event: WheelEvent) => {
    if (event.ctrlKey) {
      if (!panZoomRef.current) return console.error("Panzoom ref not set");

      const curScale = panZoomRef.current.getScale();
      const newScale = event.deltaY > 0 ? zoomScaleStepOut(curScale) : zoomScaleStepIn(curScale);
      panZoomRef.current.zoomToPoint(newScale, { clientX: event.clientX, clientY: event.clientY });
    } else debounce(navCarouselByArrowKey, 100)(event.deltaY < 0);
  };

  useSockets({ view: "carousel" });

  const mouseMoveTimeout = useRef<number | null>(null);

  const handleMouseMove = () => {
    if (mouseMoveTimeout.current) clearTimeout(mouseMoveTimeout.current);
    stores.carousel.setIsMouseMoving(true);
    mouseMoveTimeout.current = window.setTimeout(
      () => stores.carousel.setIsMouseMoving(false),
      1000
    );
  };

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  useEffect(() => {
    document.title = "Medior —— Carousel";

    ipcRenderer.on(
      "init",
      async (_, { fileId, selectedFileIds }: { fileId: string; selectedFileIds: string[] }) => {
        try {
          const { perfLog, perfLogTotal } = makePerfLog("[Carousel]");

          perfLog("Loading active file...");
          stores.file.search.setIds([fileId]);
          await stores.file.search.loadFiltered();
          stores.carousel.setActiveFileId(fileId);

          perfLog("Active file loaded. Loading carousel files and tags...");
          stores.file.search.setIds([fileId, ...selectedFileIds]);
          await Promise.all([stores.file.search.loadFiltered(), stores.tag.loadTags()]);
          stores.carousel.setSelectedFileIds(selectedFileIds);

          perfLogTotal("Data loaded into MobX.");
        } catch (err) {
          console.error(err);
        }
      }
    );
  }, []);

  return (
    <ZoomContext.Provider value={panZoomRef}>
      <VideoContext.Provider value={videoRef}>
        <View
          ref={setRootRef}
          onKeyDown={handleKeyPress}
          onMouseMove={handleMouseMove}
          onWheel={handleScroll}
          tabIndex={-1}
          className={css.root}
        >
          <CarouselTopBar />

          <Carousel ref={videoRef} />

          <CarouselThumbNavigator />

          <Views.FileModals />

          <Views.TagModals view="carousel" />
        </View>
      </VideoContext.Provider>
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
