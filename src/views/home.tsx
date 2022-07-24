import { createRef, useEffect } from "react";
import Mongoose from "mongoose";
import { getAllFiles, getAllImportBatches, getAllTags } from "database";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { Drawer, FileContainer, TopBar, View } from "components";
import { makeClasses } from "utils";
import { DB_NAME } from "env";

const DRAWER_WIDTH = 200;

const Home = observer(() => {
  const drawerRef = createRef();

  const { appStore, fileStore, importStore, tagStore } = useStores();

  const { classes: css } = useClasses({
    drawerMode: appStore.drawerMode,
    drawerWidth: DRAWER_WIDTH,
    isDrawerOpen: appStore.isDrawerOpen,
  });

  useEffect(() => {
    const loadDatabase = async () => {
      try {
        await Mongoose.connect(`mongodb://localhost:27017/${DB_NAME}`);

        const [files, importBatches, tags] = await Promise.all([
          getAllFiles(),
          getAllImportBatches(),
          getAllTags(),
        ]);

        tagStore.overwrite(tags);
        fileStore.overwrite(files);
        importStore.overwrite(importBatches);
      } catch (err) {
        console.log(err?.message ?? err);
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
