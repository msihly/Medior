import { createRef, useEffect } from "react";
import Mongoose from "mongoose";
import { getAllFiles, getAllTags } from "database";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { Drawer, FileContainer, TopBar } from "components";
import { makeStyles } from "utils";

const DRAWER_WIDTH = 200;

const Home = observer(() => {
  const drawerRef = createRef();

  const { appStore, fileStore, tagStore } = useStores();

  const { classes: css } = useClasses({
    drawerMode: appStore.drawerMode,
    drawerWidth: DRAWER_WIDTH,
    isDrawerOpen: appStore.isDrawerOpen,
  });

  useEffect(() => {
    const loadDatabase = async () => {
      try {
        await Mongoose.connect("mongodb://localhost:27017/media-viewer");

        const [files, tags] = await Promise.all([getAllFiles(), getAllTags()]);

        tagStore.overwrite(tags);
        fileStore.overwrite(files);
      } catch (err) {
        console.log(err?.message ?? err);
      }
    };

    loadDatabase();
  }, []); //eslint-disable-line

  return (
    <>
      <Drawer ref={drawerRef} />

      <div className={css.main}>
        <TopBar />
        <FileContainer files={fileStore.filtered} mode="grid" />
      </div>
    </>
  );
});

export default Home;

const useClasses = makeStyles<object>()((_, { drawerMode, drawerWidth, isDrawerOpen }: any) => ({
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
