import path from "path";
import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { FileImport, dirToFileImports, filePathsToImports, useStores } from "store";
import {
  Drawer,
  FaceRecognitionModal,
  FileCollectionEditor,
  FileCollectionManager,
  FileContainer,
  Tagger,
  TopBar,
  View,
} from "components";
import { colors, CONSTANTS, PromiseQueue, makeClasses, setupSocketIO, socket } from "utils";
import { toast } from "react-toastify";
import Color from "color";

export const Home = observer(() => {
  const rootStore = useStores();
  const { faceRecognitionStore, fileCollectionStore, fileStore, homeStore, importStore, tagStore } =
    useStores();

  const [isLoading, setIsLoading] = useState(true);

  const { css } = useClasses({ isDrawerOpen: homeStore.isDrawerOpen });

  const handleDragEnter = () => !homeStore.isDraggingOut && homeStore.setIsDraggingIn(true);

  const handleDragLeave = () => homeStore.setIsDraggingIn(false);

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleFileDrop = async (event: React.DragEvent) => {
    homeStore.setIsDraggingIn(false);

    const files = [...event.dataTransfer.files];

    try {
      const imports = (
        await Promise.all(
          files.flatMap(async (f) =>
            f.type === "" ? dirToFileImports(f.path) : filePathsToImports([f.path])
          )
        )
      ).flat();

      if (!importStore.folderToTags) {
        const res = await importStore.createImportBatch({ imports });
        if (!res.success) throw new Error(res.error);
        toast.success(`Queued ${files.length} imports`);
      } else {
        const folders = files.filter((f) => f.type === "");
        const folderPrefix = folders[0]?.path ? path.dirname(folders[0].path) : null;

        if (importStore.folderToTagsMode === "parent") {
          const tagsToCreate: { label: string; parentLabel?: string }[] = [];
          const tagsToEdit: { id: string; label: string; parentLabel?: string }[] = [];

          const flatFolderHeirarchy = imports
            .reduce((acc, cur) => {
              const folderName = path.dirname(cur.path).replace(`${folderPrefix}${path.sep}`, "");
              const folder = acc.find((f) => f.folderName === folderName);
              const parentLabel = folderName.split(path.sep).slice(0, -1).pop();
              const tagLabel = folderName.split(path.sep).pop()!;

              if (!folder) acc.push({ folderName, imports: [cur], parentLabel, tagLabel });
              else folder.imports.push(cur);

              const tag = tagStore.getByLabel(tagLabel);
              if (!tag && !tagsToCreate.find((t) => t.label === tagLabel))
                tagsToCreate.push({ label: tagLabel, parentLabel });
              else if (
                tag &&
                !tagsToEdit.find((t) => t.id === tag.id) &&
                parentLabel &&
                !tag.parentIds.includes(tagStore.getByLabel(parentLabel)?.id)
              )
                tagsToEdit.push({ id: tag.id, label: tagLabel, parentLabel });

              return acc;
            }, [] as { folderName: string; imports: FileImport[]; parentLabel?: string; tagLabel: string; tagId?: string }[])
            .sort(
              (a, b) => a.folderName.split(path.sep).length - b.folderName.split(path.sep).length
            );

          const tagQueue = new PromiseQueue();
          tagsToCreate.forEach((tagToCreate) => {
            tagQueue.add(async () => {
              const parentTag = tagToCreate.parentLabel
                ? tagStore.getByLabel(tagToCreate.parentLabel)
                : null;

              const res = await tagStore.createTag({
                label: tagToCreate.label,
                parentIds: parentTag ? [parentTag.id] : [],
              });
              if (!res.success) throw new Error(res.error);
              return res.data;
            });
          });

          tagsToEdit.forEach((tagToEdit) => {
            tagQueue.add(async () => {
              const parentTag = tagToEdit.parentLabel
                ? tagStore.getByLabel(tagToEdit.parentLabel)
                : null;

              const res = await tagStore.editTag({
                id: tagToEdit.id,
                parentIds: parentTag ? [parentTag.id] : [],
              });
              if (!res.success) throw new Error(res.error);
            });
          });

          await tagQueue.queue;

          const importQueue = new PromiseQueue();
          flatFolderHeirarchy.forEach((folder) => {
            importQueue.add(async () => {
              const tag = tagStore.getByLabel(folder.tagLabel);
              const res = await importStore.createImportBatch({
                imports: folder.imports,
                tagIds: tag ? [tag.id] : [],
              });
              if (!res.success) throw new Error(res.error);
            });
          });

          await importQueue.queue;

          toast.success(`Queued ${imports.length} imports`);
        } else {
          const tagsToCreate: string[] = [];

          const flatFolderHeirarchy = imports.reduce((acc, cur) => {
            const folderName = path.dirname(cur.path).replace(`${folderPrefix}${path.sep}`, "");
            const folder = acc.find((f) => f.folderName === folderName);

            const tagLabels = folderName.split(path.sep);
            tagLabels.forEach((label) => {
              const tag = tagStore.getByLabel(label);
              if (!tag && !tagsToCreate.find((t) => t === label)) tagsToCreate.push(label);
            });

            if (!folder) acc.push({ folderName, imports: [cur], tagLabels });
            else folder.imports.push(cur);

            return acc;
          }, [] as { folderName: string; imports: FileImport[]; tagLabels: string[] }[]);

          const tagQueue = new PromiseQueue();
          tagsToCreate.forEach((label) => {
            tagQueue.add(async () => {
              const res = await tagStore.createTag({ label });
              if (!res.success) throw new Error(res.error);
              return res.data;
            });
          });

          await tagQueue.queue;

          const importQueue = new PromiseQueue();
          flatFolderHeirarchy.forEach((folder) => {
            importQueue.add(async () => {
              const tags = folder.tagLabels
                .map((label) => tagStore.getByLabel(label))
                .filter(Boolean);
              const res = await importStore.createImportBatch({
                imports: folder.imports,
                tagIds: tags.map((t) => t.id),
              });
              if (!res.success) throw new Error(res.error);
            });
          });

          await importQueue.queue;

          toast.success(`Queued ${imports.length} imports`);
        }
      }
    } catch (err) {
      toast.error("Error queuing imports");
      console.error(err);
    }
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
