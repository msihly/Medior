import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { handleIngest, useStores } from "store";
import {
  Drawer,
  FaceRecognitionModal,
  FileCollectionEditor,
  FileCollectionManager,
  FileContainer,
  ImportEditor,
  ImportManager,
  ImportRegExMapper,
  TagManager,
  Tagger,
  TopBar,
  View,
} from "components";
import { colors, CONSTANTS, makeClasses, setupSocketIO, socket } from "utils";
import Color from "color";

export const Home = observer(() => {
  const rootStore = useStores();
  const { faceRecognitionStore, fileCollectionStore, fileStore, homeStore, importStore, tagStore } =
    useStores();

  const [isLoading, setIsLoading] = useState(true);

  const { css } = useClasses({ isDrawerOpen: homeStore.isDrawerOpen });

  const handleDragEnter = (event: React.DragEvent) => {
    const items = [...event.dataTransfer.items].filter((item) => item.kind === "file");
    if (items.length > 0 && !homeStore.isDraggingOut) homeStore.setIsDraggingIn(true);
  };

  const handleDragLeave = () => homeStore.setIsDraggingIn(false);

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleFileDrop = (event: React.DragEvent) => {
    homeStore.setIsDraggingIn(false);
    handleIngest({ fileList: event.dataTransfer.files, rootStore });
  };

  const setTaggerVisible = (val: boolean) => homeStore.setIsTaggerOpen(val);

  useEffect(() => {
    document.title = "Media Viewer // Home";
    console.debug("Home window useEffect fired.");

    const loadDatabase = async () => {
      try {
        setIsLoading(true);
        let perfStart = performance.now();

        await Promise.all([
          fileCollectionStore.loadCollections(),
          importStore.loadImportBatches(),
          importStore.loadRegExMaps(),
          tagStore.loadTags(),
        ]);

        console.debug(`Data loaded into MobX in ${performance.now() - perfStart}ms.`);
        setIsLoading(false);
      } catch (err) {
        console.error(err);
      }
    };

    loadDatabase();

    setupSocketIO();

    socket.on("filesDeleted", () => {
      fileCollectionStore.loadCollections();
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

      <View column className={css.root}>
        <TopBar />

        <View row>
          <Drawer />

          <View column className={css.main}>
            {isLoading ? null : <FileContainer />}

            {faceRecognitionStore.isModalOpen && <FaceRecognitionModal />}

            {homeStore.isTaggerOpen && (
              <Tagger fileIds={homeStore.taggerFileIds} setVisible={setTaggerVisible} />
            )}

            {fileCollectionStore.isCollectionManagerOpen && <FileCollectionManager />}

            {fileCollectionStore.isCollectionEditorOpen && <FileCollectionEditor />}

            {tagStore.isTagManagerOpen && <TagManager />}

            <ImportManager />

            {importStore.isImportEditorOpen && <ImportEditor />}

            {importStore.isImportRegExMapperOpen && <ImportRegExMapper />}
          </View>
        </View>
      </View>
    </View>
  );
});

const useClasses = makeClasses((_, { isDrawerOpen }) => ({
  main: {
    display: "flex",
    flexFlow: "column",
    marginLeft: isDrawerOpen ? CONSTANTS.DRAWER_WIDTH : 0,
    width: isDrawerOpen ? `calc(100% - ${CONSTANTS.DRAWER_WIDTH}px)` : "inherit",
    height: `calc(100vh - ${CONSTANTS.TOP_BAR_HEIGHT})`,
    overflow: "auto",
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
  root: {
    height: "100vh",
    overflow: "hidden",
  },
}));
