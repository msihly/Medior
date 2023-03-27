import { ipcRenderer } from "electron";
import { stat } from "fs/promises";
import { createRef, useEffect, useState } from "react";
import Mongoose from "mongoose";
import {
  createImportBatch,
  createTag,
  editFileTags,
  editTag,
  getAllImportBatches,
  getAllTags,
  setFileRating,
} from "database";
import { onPatches } from "mobx-keystone";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { colors } from "@mui/material";
import { Drawer, FileContainer, TopBar, View } from "components";
import { CONSTANTS, dayjs, dirToFileImports, filePathsToImports, makeClasses } from "utils";
import { toast } from "react-toastify";
import Color from "color";

export const Home = observer(() => {
  const drawerRef = createRef();

  const rootStore = useStores();
  const { homeStore, importStore, tagStore } = useStores();

  const [isLoading, setIsLoading] = useState(true);
  const [isOverlayVisible, setIsOverlayVisible] = useState(false);

  const { css } = useClasses({
    drawerMode: homeStore.drawerMode,
    drawerWidth: 200,
    isDrawerOpen: homeStore.isDrawerOpen,
    isOverlayVisible,
  });

  const handleDragEnter = () => setIsOverlayVisible(true);

  const handleDragLeave = () => setIsOverlayVisible(false);

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleFileDrop = async (event: React.DragEvent) => {
    try {
      setIsOverlayVisible(false);

      const paths: string[] = [...event.dataTransfer.files].map((f) => f.path);

      const createdAt = dayjs().toISOString();
      const imports = (
        await Promise.all(
          paths.map(async (p) =>
            (await stat(p)).isDirectory() ? dirToFileImports(p) : filePathsToImports([p])
          )
        )
      ).flat();

      const batchRes = await createImportBatch({ createdAt, imports, importStore });
      if (!batchRes.success) throw new Error(batchRes?.error);
      toast.success(`Queued ${imports.length} imports`);
    } catch (err) {
      toast.error("Error queuing imports");
      console.error(err);
    }
  };

  useEffect(() => {
    document.title = "Home";
    console.debug("Home window useEffect fired.");

    const loadDatabase = async () => {
      try {
        setIsLoading(true);

        const databaseUri = await ipcRenderer.invoke("getDatabaseUri");
        console.debug("Connecting to database:", databaseUri, "...");
        await Mongoose.connect(databaseUri, CONSTANTS.MONGOOSE_OPTS);

        let perfStart = performance.now();
        const [importBatches, tags] = await Promise.all([getAllImportBatches(), getAllTags()]);
        tagStore.overwrite(tags);
        importStore.overwrite(importBatches);
        console.debug(
          `Import batches and tags loaded into MobX in ${performance.now() - perfStart}ms.`
        );

        onPatches(tagStore.tags, (patches) => {
          ipcRenderer.send("onTagPatch", { patches });
        });

        ipcRenderer.on("createTag", (_, { aliases, label, parentIds }) => {
          createTag({ aliases, label, parentIds, rootStore });
        });

        ipcRenderer.on("editTag", (_, { aliases, childIds, id, label, parentIds }) => {
          editTag({ aliases, childIds, id, label, parentIds, rootStore });
        });

        ipcRenderer.on("editFileTags", (_, { addedTagIds, batchId, fileIds, removedTagIds }) => {
          editFileTags({ addedTagIds, batchId, fileIds, removedTagIds, rootStore });
        });

        ipcRenderer.on("setFileRating", (_, { fileIds, rating }) => {
          setFileRating({ fileIds, rating });
        });

        setIsLoading(false);
      } catch (err) {
        console.error(err);
      }
    };

    loadDatabase();
  }, []);

  return (
    <View onDragOver={handleDragOver} onDragEnter={handleDragEnter}>
      {isOverlayVisible && (
        <View onDragLeave={handleDragLeave} onDrop={handleFileDrop} className={css.overlay} />
      )}

      <View>
        <Drawer ref={drawerRef} />

        <View column className={css.main}>
          <TopBar />

          {isLoading ? null : <FileContainer />}
        </View>
      </View>
    </View>
  );
});

const useClasses = makeClasses((_, { drawerMode, drawerWidth, isDrawerOpen }) => ({
  main: {
    display: "flex",
    flexFlow: "column",
    marginLeft: drawerMode === "persistent" && isDrawerOpen ? drawerWidth : 0,
    width:
      drawerMode === "persistent" && isDrawerOpen ? `calc(100% - ${drawerWidth}px)` : "inherit",
    height: "100vh",
    overflow: "hidden",
    transition: "all 225ms ease-in-out",
  },
  overlay: {
    position: "fixed",
    top: 0,
    bottom: 0,
    right: 0,
    left: 0,
    border: `15px dashed ${colors.blue["600"]}`,
    backgroundColor: Color(colors.blue["800"]).fade(0.5).string(),
    opacity: 0.3,
    // pointerEvents: "none",
    zIndex: 5000, // necessary for MUI z-index values
  },
}));
