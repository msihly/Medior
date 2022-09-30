import { createRef, useEffect } from "react";
import Mongoose from "mongoose";
import { DB_NAME } from "env";
import { getAllFiles, getAllImportBatches, getAllTags } from "database";
import { observer } from "mobx-react-lite";
import { onSnapshot } from "mobx-state-tree";
import { useStores } from "store";
import { Drawer, FileContainer, TopBar, View } from "components";
import { makeClasses } from "utils";

const DRAWER_WIDTH = 200;

const Home = observer(() => {
  const drawerRef = createRef();

  const rootStore = useStores();
  const { appStore, fileStore, importStore, tagStore } = useStores();

  const { classes: css } = useClasses({
    drawerMode: appStore.drawerMode,
    drawerWidth: DRAWER_WIDTH,
    isDrawerOpen: appStore.isDrawerOpen,
  });

  useEffect(() => {
    document.title = "Home";
    console.debug("Home window useEffect fired.");

    localStorage.removeItem("mst");

    onSnapshot(rootStore, (snapshot) => {
      localStorage.setItem("mst", JSON.stringify(snapshot));
    });

    const loadDatabase = async () => {
      try {
        console.debug("Connecting to database...");
        await Mongoose.connect(`mongodb://localhost:27017/${DB_NAME}`);

        console.debug("Connected to database. Retrieving data...");
        const [files, importBatches, tags] = await Promise.all([
          getAllFiles(),
          getAllImportBatches(),
          getAllTags(),
        ]);

        console.debug("Data retrieved. Storing in MST...");
        tagStore.overwrite(tags);
        fileStore.overwrite(files);
        importStore.overwrite(importBatches);

        console.debug("Data stored in MST.");
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

export default Home;

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
