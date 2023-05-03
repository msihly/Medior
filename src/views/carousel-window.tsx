import { ipcRenderer } from "electron";
import { useEffect, useRef, useState } from "react";
import Mongoose from "mongoose";
import { getAllTags, getFiles } from "database";
import { Patch, applyPatches } from "mobx-keystone";
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
import { CONSTANTS, debounce, makeClasses } from "utils";

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

    const connectToDb = async () => {
      try {
        const databaseUri = await ipcRenderer.invoke("getDatabaseUri");
        console.debug("Connecting to database:", databaseUri, "...");
        await Mongoose.connect(databaseUri, CONSTANTS.MONGOOSE_OPTS);
        console.debug("Connected to database");
        return true;
      } catch (err) {
        console.error(err);
        return false;
      }
    };

    const isDbConnected = connectToDb();

    const loadDatabase = async (fileIds: string[]) => {
      let perfStart = performance.now();

      const [files, tags] = await Promise.all([getFiles(fileIds), getAllTags()]);
      fileStore.overwrite(files);
      tagStore.overwrite(tags);

      console.debug(`Files and tags loaded into MobX in ${performance.now() - perfStart}ms.`);
    };

    ipcRenderer.on(
      "init",
      async (_, { fileId, selectedFileIds }: { fileId: string; selectedFileIds: string[] }) => {
        if (await isDbConnected) await loadDatabase(selectedFileIds);
        setActiveFileId(fileId);
        setSelectedFileIds(selectedFileIds);

        ipcRenderer.on("onFilesEdited", async (_, { fileIds }: { fileIds: string[] }) => {
          console.log({ fileIds, selectedFileIds });
          if (fileIds.some((id) => selectedFileIds.includes(id))) {
            const files = await getFiles(fileIds);
            console.log(files);
            files.forEach((f) => fileStore.getById(f.id).update(f));
          }
        });

        ipcRenderer.on("onTagPatch", (_, { patches }: { patches: Patch[] }) => {
          console.log("onTagPatch", patches);
          applyPatches(tagStore.tags, patches);
        });
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
