import { ipcRenderer } from "electron";
import { WheelEvent, useEffect, useRef } from "react";
import { observer, useStores } from "store";
import { PanzoomObject } from "@panzoom/panzoom";
import { Carousel, CarouselThumbNavigator, CarouselTopBar, View, ZoomContext } from "components";
import { Views, useHotkeys, useSockets } from "./common";
import { debounce, makeClasses, makePerfLog, zoomScaleStepIn, zoomScaleStepOut } from "utils";

export const CarouselWindow = observer(() => {
  const { css } = useClasses(null);

  const stores = useStores();

  const panZoomRef = useRef<PanzoomObject>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const { handleKeyPress, navCarouselByArrowKey } = useHotkeys({ rootRef, view: "carousel" });

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
    mouseMoveTimeout.current = window.setTimeout(() => stores.carousel.setIsMouseMoving(false), 1000);
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
          const { perfLog, perfLogTotal } = makePerfLog("[Carousel]");

          await stores.file.loadFiles({ fileIds: [fileId] });
          stores.carousel.setActiveFileId(fileId);

          perfLog("Active file loaded");

          await Promise.all([
            stores.file.loadFiles({ fileIds: selectedFileIds }),
            stores.tag.loadTags(),
          ]);
          stores.carousel.setSelectedFileIds(selectedFileIds);

          perfLogTotal("Data loaded into MobX");

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
