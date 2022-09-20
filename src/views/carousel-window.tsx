import { ipcRenderer } from "electron";
import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { applySnapshot } from "mobx-state-tree";
import { useStores } from "store";
import {
  Carousel,
  CarouselContext,
  CarouselThumbNavigator,
  CarouselTopBar,
  View,
} from "components";
import { debounce, makeClasses } from "utils";

const CarouselWindow = observer(() => {
  const rootStore = useStores();
  const { fileStore } = useStores();

  const { classes: css } = useClasses(null);

  const panZoomRef = useRef(null);
  const rootRef = useRef(null);

  const [activeFileId, setActiveFileId] = useState<string>(null);
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>(null);

  useEffect(() => {
    document.title = "Carousel";
    console.debug("Carousel window useEffect fired.");

    const storedData = localStorage.getItem("mst");
    if (typeof storedData === "string") applySnapshot(rootStore, JSON.parse(storedData));

    if (!activeFileId) setActiveFileId(fileStore.carouselFileId);
    if (!selectedFileIds) setSelectedFileIds(fileStore.carouselSelectedFileIds);

    window.addEventListener("storage", (event) => {
      if (event.key === "mst") {
        const newValue = JSON.parse(event.newValue);
        if (newValue) applySnapshot(rootStore, newValue);
      }
    });

    rootRef.current?.focus();
  }, []);

  const handleScroll = (event) => debounce(handleNav, 100)(event.deltaY < 0);

  const handleNav = (isLeft: boolean) => {
    const activeFileIndex = selectedFileIds.findIndex((id) => id === activeFileId);
    if (activeFileIndex === (isLeft ? 0 : selectedFileIds.length - 1)) return;
    setActiveFileId(selectedFileIds[activeFileIndex + (isLeft ? -1 : 1)]);
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLElement>) => {
    if (["ArrowLeft", "ArrowRight"].includes(e.key)) handleNav(e.key === "ArrowLeft");
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
      </View>
    </CarouselContext.Provider>
  );
});

export default CarouselWindow;

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
