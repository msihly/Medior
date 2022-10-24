import { ipcRenderer } from "electron";
import { createRef, useEffect } from "react";
import Mongoose from "mongoose";
import {
  FileImportBatchModel,
  FileModel,
  getAllFiles,
  getAllImportBatches,
  getAllTags,
  TagModel,
} from "database";
import { observer } from "mobx-react-lite";
import { ImportBatch, useStores } from "store";
import { Drawer, FileContainer, TopBar, View } from "components";
import { makeClasses } from "utils";

export const Home = observer(() => {
  const drawerRef = createRef();

  const { fileStore, homeStore, importStore, tagStore } = useStores();

  const { classes: css } = useClasses({
    drawerMode: homeStore.drawerMode,
    drawerWidth: 200,
    isDrawerOpen: homeStore.isDrawerOpen,
  });

  useEffect(() => {
    document.title = "Home";
    console.debug("Home window useEffect fired.");

    const loadDatabase = async () => {
      try {
        const databaseUri = await ipcRenderer.invoke("getDatabaseUri");
        console.debug("Connecting to database:", databaseUri, "...");
        await Mongoose.connect(databaseUri);

        console.debug("Connected to database. Retrieving data...");
        const [files, importBatches, tags] = await Promise.all([
          getAllFiles(),
          getAllImportBatches(),
          getAllTags(),
        ]);

        console.debug("Data retrieved. Storing in MobX...");

        tagStore.overwrite(tags);
        fileStore.overwrite(files);
        importStore.overwrite(importBatches);

        console.debug("Data stored in MobX.");

        FileModel.watch().on("change", (data: any) => {
          const id = Buffer.from(data.documentKey?._id).toString();
          console.debug(`[File] ${id}:`, data);

          switch (data.operationType) {
            case "insert":
              fileStore.addFiles({ ...data.fullDocument, id, _id: undefined, __v: undefined });
              break;
            case "update":
              fileStore.getById(id).update(data.updateDescription?.updatedFields);
              break;
          }
        });

        FileImportBatchModel.watch().on("change", (data: any) => {
          const id = Buffer.from(data.documentKey?._id).toString();
          console.debug(`[FileImportBatch] ${id}:`, data);

          if (data.operationType === "update") {
            const updates = data.updateDescription?.updatedFields;
            if (Object.keys(updates).includes("tagIds"))
              importStore.getById(id).setTagIds(updates?.tagIds);
          }
        });

        TagModel.watch().on("change", (data: any) => {
          const id = Buffer.from(data.documentKey?._id).toString();
          console.debug(`[Tag] ${id}:`, data);

          switch (data.operationType) {
            case "delete":
              if (tagStore.activeTagId === id) tagStore.setActiveTagId(null);
              if (tagStore.isTaggerOpen) tagStore.setTaggerMode("edit");
              if (tagStore.isTagManagerOpen) tagStore.setTagManagerMode("search");
              tagStore.deleteTag(id);
              break;
            case "insert":
              tagStore.createTag({ ...data.fullDocument, id, _id: undefined, __v: undefined });
              break;
            case "update":
              tagStore.getById(id).update(data.updateDescription?.updatedFields);
              break;
          }
        });
      } catch (err) {
        console.error(err);
      }
    };

    loadDatabase();
  }, []);

  return (
    <>
      <Drawer ref={drawerRef} />

      <View className={css.main}>
        <TopBar />
        <FileContainer mode="grid" />
      </View>
    </>
  );
});

const useClasses = makeClasses((_, { drawerMode, drawerWidth, isDrawerOpen }) => ({
  main: {
    display: "flex",
    flexFlow: "column",
    marginLeft: drawerMode === "persistent" && isDrawerOpen ? drawerWidth : 0,
    width:
      drawerMode === "persistent" && isDrawerOpen ? `calc(100% - ${drawerWidth}px)` : "inherit",
    height: "inherit",
    transition: "all 225ms ease-in-out",
  },
}));
