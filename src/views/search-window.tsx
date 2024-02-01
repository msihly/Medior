import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import {
  Drawer,
  FaceRecognitionModal,
  FileCollectionEditor,
  FileCollectionManager,
  FileContainer,
  ImportRegExMapper,
  TagEditor,
  TagManager,
  TagMerger,
  Tagger,
  TopBar,
  View,
} from "components";
import { CONSTANTS, makeClasses, setupSocketIO, socket } from "utils";

export const SearchWindow = observer(() => {
  const rootStore = useStores();
  const { faceRecognitionStore, fileCollectionStore, fileStore, homeStore, importStore, tagStore } =
    useStores();

  const [isLoading, setIsLoading] = useState(true);

  const { css } = useClasses({ isDrawerOpen: homeStore.isDrawerOpen });

  const setTaggerVisible = (val: boolean) => homeStore.setIsTaggerOpen(val);

  useEffect(() => {
    document.title = "Media Viewer // Search";
    console.debug("Search window useEffect fired.");

    const loadDatabase = async () => {
      try {
        setIsLoading(true);
        let perfStart = performance.now();

        await Promise.all([
          fileCollectionStore.loadCollections(),
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

    socket.on("reloadFileCollections", () => fileCollectionStore.loadCollections());
    socket.on("reloadFiles", () => homeStore.reloadDisplayedFiles({ rootStore }));
    socket.on("reloadRegExMaps", () => importStore.loadRegExMaps());
    socket.on("reloadTags", () => tagStore.loadTags());

    socket.on("tagCreated", ({ tag }) => tagStore._addTag(tag));

    socket.on("tagDeleted", ({ tagId }) => {
      importStore.editBatchTags({ removedIds: [tagId] });
      homeStore.removeDeletedTag(tagId);
      tagStore._deleteTag(tagId);
    });

    socket.on("tagsUpdated", (tags) => {
      tags.forEach((t) => tagStore.getById(t.tagId)?.update(t.updates));
    });
  }, []);

  return (
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

          {tagStore.isTagEditorOpen && <TagEditor id={tagStore.activeTagId} hasSubEditor />}

          {tagStore.isTagSubEditorOpen && <TagEditor id={tagStore.subEditorTagId} isSubEditor />}

          {tagStore.isTagManagerOpen && <TagManager />}

          {tagStore.isTagMergerOpen && <TagMerger />}

          {importStore.isImportRegExMapperOpen && <ImportRegExMapper />}
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
  root: {
    height: "100vh",
    overflow: "hidden",
  },
}));
