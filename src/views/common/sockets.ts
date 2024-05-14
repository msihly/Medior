import { useEffect } from "react";
import { SocketEmitEvent, SocketEmitEvents } from "server";
import { useStores } from "store";
import { setupSocketIO, socket, throttle } from "utils";

export interface UseSocketsProps {
  view: "carousel" | "home" | "search";
}

export const useSockets = ({ view }: UseSocketsProps) => {
  const debug = false;

  const rootStore = useStores();
  const { carouselStore, fileCollectionStore, fileStore, homeStore, importStore, tagStore } =
    useStores();

  const debugLog = (
    eventName: SocketEmitEvent,
    eventArgs: Parameters<SocketEmitEvents[SocketEmitEvent]>[0]
  ) => debug && console.debug(`[Socket] ${eventName}`, eventArgs);

  const makeSocket = <T extends SocketEmitEvent>(
    eventName: T,
    callback: (args: Parameters<SocketEmitEvents[T]>[0]) => void
  ) =>
    // @ts-expect-error
    socket.on(eventName, (eventArgs) => {
      debugLog(eventName, eventArgs);
      callback(eventArgs);
    });

  const queueFileReload = () =>
    rootStore.getIsBlockingModalOpen()
      ? homeStore.setHasQueuedReload(true)
      : homeStore.loadFilteredFiles();

  const setupSockets = () => {
    setupSocketIO();

    makeSocket("filesDeleted", ({ fileHashes, fileIds }) => {
      if (view === "carousel") carouselStore.removeFiles(fileIds);
      else {
        if (view === "home") importStore.addDeletedFileHashes(fileHashes);
        if (fileCollectionStore.isManagerOpen) fileCollectionStore.listFilteredCollections();
        queueFileReload();
      }
    });

    makeSocket("filesUpdated", ({ fileIds, updates }) => {
      fileStore.updateFiles(fileIds, updates);

      if (view !== "carousel") {
        const updatedKeys = Object.keys(updates);
        const shouldReload =
          updatedKeys.some((k) => ["isArchived", "tagIds"].includes(k)) ||
          updatedKeys.includes(homeStore.sortValue.key);
        if (shouldReload) queueFileReload();
      }
    });

    makeSocket("fileTagsUpdated", ({ addedTagIds, batchId, fileIds, removedTagIds }) => {
      fileStore.updateFileTags({ addedTagIds, fileIds, removedTagIds });

      if (view !== "carousel") queueFileReload();
      if (view === "home" && batchId?.length > 0)
        importStore.editBatchTags({
          addedIds: addedTagIds,
          batchIds: [batchId],
          removedIds: removedTagIds,
        });
    });

    makeSocket("reloadFiles", () => {
      if (view === "carousel") fileStore.loadFiles({ fileIds: carouselStore.selectedFileIds });
      else queueFileReload();
    });

    makeSocket("reloadTags", () => tagStore.loadTags());

    makeSocket("tagCreated", ({ tag }) => tagStore._addTag(tag));

    makeSocket("tagDeleted", ({ tagId }) => {
      tagStore._deleteTag(tagId);
      if (view === "home") importStore.editBatchTags({ removedIds: [tagId] });
      if (view !== "carousel") queueFileReload();
    });

    makeSocket("tagMerged", ({ oldTagId }) => {
      if (view === "home") importStore.editBatchTags({ removedIds: [oldTagId] });
    });

    makeSocket("tagsUpdated", ({ tags, withFileReload }) => {
      tags.forEach((t) => tagStore.getById(t.tagId)?.update(t.updates));
      if (withFileReload && view !== "carousel") throttle(queueFileReload, 2000)();
    });

    if (view === "carousel") {
      makeSocket("filesArchived", ({ fileIds }) => carouselStore.removeFiles(fileIds));
    } else {
      makeSocket("collectionCreated", ({ collection }) =>
        fileCollectionStore._addCollection(collection)
      );

      makeSocket("collectionDeleted", ({ collectionId }) =>
        fileCollectionStore._deleteCollection(collectionId)
      );

      makeSocket("collectionUpdated", ({ collectionId, updates }) =>
        fileCollectionStore.getById(collectionId)?.update(updates)
      );

      makeSocket("importBatchCompleted", () => {
        throttle(queueFileReload, 5000)();
      });

      makeSocket("reloadFileCollections", () => {
        if (fileCollectionStore.isManagerOpen) fileCollectionStore.listFilteredCollections();
      });
    }

    if (view === "home") makeSocket("reloadImportBatches", () => importStore.loadImportBatches());
  };

  useEffect(() => {
    setupSockets();
    return () => (socket.disconnect(), null);
  }, []);
};
