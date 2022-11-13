import { ipcRenderer } from "electron";
import { createRef, useEffect } from "react";
import Mongoose from "mongoose";
import {
  FileModel,
  getAllFiles,
  getAllImportBatches,
  getAllTags,
  watchFileModel,
  watchImportBatchModel,
  watchTagModel,
} from "database";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { Drawer, FileContainer, TopBar, View } from "components";
import { CONSTANTS, makeClasses } from "utils";

export const Home = observer(() => {
  const drawerRef = createRef();

  const { fileStore, homeStore, importStore, tagStore } = useStores();

  const { css } = useClasses({
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
        await Mongoose.connect(databaseUri, CONSTANTS.MONGOOSE_OPTS);

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

        watchFileModel(fileStore);
        watchImportBatchModel(importStore);
        watchTagModel(tagStore);
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
        <FileContainer />
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
