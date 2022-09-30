import { useEffect, useRef, useState } from "react";
import Mongoose from "mongoose";
import { DB_NAME } from "env";
import { setFileRating } from "database";
import { observer } from "mobx-react-lite";
import { applySnapshot } from "mobx-state-tree";
import { useStores } from "store";
import {
  Carousel,
  CarouselContext,
  CarouselThumbNavigator,
  CarouselTopBar,
  Tagger,
  View,
} from "components";
import { debounce, makeClasses } from "utils";

const CarouselWindow = observer(() => {
  const rootStore = useStores();
  const { fileStore } = useStores();

  const { classes: css } = useClasses(null);

  const panZoomRef = useRef(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const [activeFileId, setActiveFileId] = useState<string>(null);
  const [isTaggerOpen, setIsTaggerOpen] = useState(false);
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>(null);

  const file = fileStore.getById(activeFileId);

  useEffect(() => {
    document.title = "Carousel";
    console.debug("Carousel window useEffect fired.");

    const connectToDatabase = async () => {
      console.debug("Connecting to database...");
      await Mongoose.connect(`mongodb://localhost:27017/${DB_NAME}`);
      console.debug("Connected to database.");
    };

    connectToDatabase();

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
    rootRef.current?.focus();
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key === "t" && !isTaggerOpen) {
      e.preventDefault();
      setIsTaggerOpen(true);
    } else if (["ArrowLeft", "ArrowRight"].includes(e.key)) handleNav(e.key === "ArrowLeft");
    else if (["1", "2", "3", "4", "5", "6", "7", "8", "9"].includes(e.key)) {
      setFileRating(fileStore, [activeFileId], +e.key);
    }
  };

  return (
    <CarouselContext.Provider
      value={{ activeFileId, panZoomRef, selectedFileIds, setActiveFileId, setIsTaggerOpen }}
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

        {isTaggerOpen && <Tagger files={[file]} setIsOpen={setIsTaggerOpen} hasFocusOnOpen />}
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
