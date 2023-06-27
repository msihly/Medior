import { stat } from "fs/promises";
import { createRef, useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { colors } from "@mui/material";
import { Drawer, FileContainer, TopBar, View } from "components";
import { dirToFileImports, filePathsToImports, makeClasses, setupSocketIO, trpc } from "utils";
import { toast } from "react-toastify";
import Color from "color";

export const Home = observer(() => {
  const drawerRef = createRef();

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

      const imports = (
        await Promise.all(
          paths.map(async (p) =>
            (await stat(p)).isDirectory() ? dirToFileImports(p) : filePathsToImports([p])
          )
        )
      ).flat();

      await importStore.createImportBatch({ imports });

      toast.success(`Queued ${imports.length} imports`);
    } catch (err) {
      toast.error("Error queuing imports");
      console.error(err);
    }
  };

  useEffect(() => {
    document.title = "Media Viewer // Home";
    console.debug("Home window useEffect fired.");

    const loadDatabase = async () => {
      try {
        setIsLoading(true);
        let perfStart = performance.now();

        const [importBatchesRes, tagsRes] = await Promise.all([
          trpc.listImportBatches.mutate(),
          trpc.listTags.mutate(),
        ]);

        if (importBatchesRes.success) importStore.overwrite(importBatchesRes.data);
        if (tagsRes.success) tagStore.overwrite(tagsRes.data);

        console.debug(`Data loaded into MobX in ${performance.now() - perfStart}ms.`);
        setIsLoading(false);

        const io = setupSocketIO();
        io.on("connected", () => console.debug("Socket.io connected."));

        io.on("onFilesEdited", ({ fileIds }: { fileIds: string[] }) =>
          console.debug("onFilesEdited", fileIds)
        );
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
