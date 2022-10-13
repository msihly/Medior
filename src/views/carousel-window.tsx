import { ipcRenderer } from "electron";
import { useEffect, useRef, useState } from "react";
import Mongoose from "mongoose";
import { FileModel, getAllFiles, getAllTags, setFileRating, TagModel } from "database";
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
import { debounce, makeClasses } from "utils";

export const CarouselWindow = observer(() => {
  const { fileStore, tagStore } = useStores();

  const { classes: css } = useClasses(null);

  const panZoomRef = useRef(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const [activeFileId, setActiveFileId] = useState<string>(null);
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);

  const file = activeFileId ? fileStore.getById(activeFileId) : null;

  useEffect(() => {
    document.title = "Carousel";
    console.debug("Carousel window useEffect fired.");

    const connectToDatabase = async () => {
      const databaseUri = await ipcRenderer.invoke("getDatabaseUri");
      console.debug("Connecting to database:", databaseUri, "...");
      await Mongoose.connect(databaseUri);

      console.debug("Connected to database. Retrieving data...");
      const [files, tags] = await Promise.all([getAllFiles(), getAllTags()]);

      console.debug("Data retrieved. Storing in MST...");
      tagStore.overwrite(tags);
      fileStore.overwrite(files);

      console.debug("Data stored in MST.");

      FileModel.watch().on("change", (data: any) => {
        const id = Buffer.from(data.documentKey?._id).toString();
        console.debug(`[File] ${id}:`, data);

        switch (data.operationType) {
          case "insert":
            fileStore.addFiles({ ...data.fullDocument, id });
            break;
          case "update":
            fileStore.getById(id).update(data.updateDescription?.updatedFields);
            break;
        }
      });

      TagModel.watch().on("change", (data: any) => {
        const id = Buffer.from(data.documentKey?._id).toString();
        console.debug(`[Tag] ${id}:`, data);

        switch (data.operationType) {
          case "delete":
            if (tagStore.activeTagId === id) tagStore.setActiveTagId(null);
            if (tagStore.isTaggerOpen) tagStore.setTaggerMode("edit");
            tagStore.deleteTag(id);
            break;
          case "insert":
            tagStore.createTag({ ...data.fullDocument, id });
            break;
          case "update":
            tagStore.getById(id).update(data.updateDescription?.updatedFields);
            break;
        }
      });
    };

    connectToDatabase();

    ipcRenderer.on("init", (_, { fileId, selectedFileIds }) => {
      setActiveFileId(fileId);
      setSelectedFileIds(selectedFileIds);
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
    if (e.key === "t" && !tagStore.isTaggerOpen) {
      e.preventDefault();
      tagStore.setIsTaggerOpen(true);
    } else if (["ArrowLeft", "ArrowRight"].includes(e.key)) handleNav(e.key === "ArrowLeft");
    else if (["1", "2", "3", "4", "5", "6", "7", "8", "9"].includes(e.key)) {
      setFileRating([activeFileId], +e.key);
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

        {tagStore.isTaggerOpen && <Tagger files={[file]} hasFocusOnOpen />}
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
