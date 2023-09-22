import { stat } from "fs/promises";
import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { colors } from "@mui/material";
import { Drawer, FaceRecognitionModal, FileContainer, TopBar, View } from "components";
import { dirToFileImports, filePathsToImports, makeClasses, setupSocketIO, socket } from "utils";
import { toast } from "react-toastify";
import Color from "color";

export const Home = observer(() => {
  const rootStore = useStores();
  const { faceRecognitionStore, fileStore, homeStore, importStore, tagStore } = useStores();

  const [isLoading, setIsLoading] = useState(true);

  const { css } = useClasses({
    drawerMode: homeStore.drawerMode,
    drawerWidth: 200,
    isDrawerOpen: homeStore.isDrawerOpen,
  });

  const handleDragEnter = () => !homeStore.isDraggingOut && homeStore.setIsDraggingIn(true);

  const handleDragLeave = () => homeStore.setIsDraggingIn(false);

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleFileDrop = async (event: React.DragEvent) => {
    try {
      homeStore.setIsDraggingIn(false);

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

        await Promise.all([importStore.loadImportBatches(), tagStore.loadTags()]);

        console.debug(`Data loaded into MobX in ${performance.now() - perfStart}ms.`);
        setIsLoading(false);
      } catch (err) {
        console.error(err);
      }
    };

    loadDatabase();

    setupSocketIO();

    socket.on("filesDeleted", () => {
      homeStore.reloadDisplayedFiles({ rootStore });
    });

    socket.on("filesUpdated", ({ fileIds, updates }) => {
      fileStore.updateFiles(fileIds, updates);
      homeStore.reloadDisplayedFiles({ rootStore });
    });

    socket.on("fileTagsUpdated", ({ addedTagIds, batchId, fileIds, removedTagIds }) => {
      if (batchId?.length > 0)
        importStore.editBatchTags({
          addedIds: addedTagIds,
          batchIds: [batchId],
          removedIds: removedTagIds,
        });
      fileStore.updateFileTags({ addedTagIds, fileIds, removedTagIds });
      homeStore.reloadDisplayedFiles({ rootStore });
    });

    socket.on("tagCreated", () => tagStore.loadTags());

    socket.on("tagDeleted", ({ tagId }) => {
      importStore.editBatchTags({ removedIds: [tagId] });
      homeStore.removeDeletedTag(tagId);
      tagStore.loadTags();
    });

    socket.on("tagUpdated", () => tagStore.loadTags());
  }, []);

  return (
    <View onDragOver={handleDragOver} onDragEnter={handleDragEnter}>
      {homeStore.isDraggingIn && (
        <View onDragLeave={handleDragLeave} onDrop={handleFileDrop} className={css.overlay} />
      )}

      <View>
        <Drawer />

        <View column className={css.main}>
          <TopBar />

          {isLoading ? null : <FileContainer />}

          {faceRecognitionStore.isModalOpen && <FaceRecognitionModal />}
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
