import { useEffect } from "react";
import { SocketEmitEvent, SocketEmitEvents } from "src/server";
import { useStores } from "src/store";
import { setupSocketIO, socket, throttle } from "src/utils";

export interface UseSocketsProps {
  view: "carousel" | "home" | "search";
}

export const useSockets = ({ view }: UseSocketsProps) => {
  const debug = false;

  const stores = useStores();

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
    stores._getIsBlockingModalOpen()
      ? stores.home.setHasQueuedReload(true)
      : stores.home.loadFilteredFiles();

  const setupSockets = () => {
    setupSocketIO();

    makeSocket("filesDeleted", ({ fileHashes, fileIds }) => {
      if (view === "carousel") stores.carousel.removeFiles(fileIds);
      else {
        if (view === "home") stores.import.addDeletedFileHashes(fileHashes);
        if (stores.collection.isManagerOpen) stores.collection.listFilteredCollections();
        queueFileReload();
      }
    });

    makeSocket("filesUpdated", ({ fileIds, updates }) => {
      stores.file.updateFiles(fileIds, updates);

      if (view !== "carousel") {
        const updatedKeys = Object.keys(updates);
        const shouldReload =
          updatedKeys.some((k) => ["isArchived", "tagIds"].includes(k)) ||
          updatedKeys.includes(stores.home.sortValue.key);
        if (shouldReload) queueFileReload();
      }
    });

    makeSocket("fileTagsUpdated", ({ addedTagIds, batchId, fileIds, removedTagIds }) => {
      stores.file.updateFileTags({ addedTagIds, fileIds, removedTagIds });

      if (view !== "carousel") queueFileReload();
      if (view === "home" && batchId?.length > 0)
        stores.import.editBatchTags({
          addedIds: addedTagIds,
          batchIds: [batchId],
          removedIds: removedTagIds,
        });
    });

    makeSocket("reloadFiles", () => {
      if (view === "carousel") stores.file.loadFiles({ fileIds: stores.carousel.selectedFileIds });
      else queueFileReload();
    });

    makeSocket("reloadTags", () => stores.tag.loadTags());

    makeSocket("tagCreated", ({ tag }) => {
      stores.tag._addTag(tag);
      if (view !== "carousel" && stores.tagManager.isOpen) stores.tagManager.loadFilteredTags();
    });

    makeSocket("tagDeleted", ({ tagId }) => {
      stores.tag._deleteTag(tagId);
      if (view === "home") stores.import.editBatchTags({ removedIds: [tagId] });
      if (view !== "carousel") {
        queueFileReload();
        if (stores.tagManager.isOpen) stores.tagManager.loadFilteredTags();
      }
    });

    makeSocket("tagMerged", ({ oldTagId }) => {
      if (view === "home") stores.import.editBatchTags({ removedIds: [oldTagId] });
      if (view !== "carousel" && stores.tagManager.isOpen) stores.tagManager.loadFilteredTags();
    });

    makeSocket("tagsUpdated", ({ tags, withFileReload }) => {
      tags.forEach((t) => stores.tag.getById(t.tagId)?.update(t.updates));
      if (withFileReload && view !== "carousel") throttle(queueFileReload, 2000)();
    });

    if (view === "carousel") {
      makeSocket("filesArchived", ({ fileIds }) => stores.carousel.removeFiles(fileIds));
    } else {
      makeSocket("collectionCreated", ({ collection }) =>
        stores.collection._addCollection(collection)
      );

      makeSocket("collectionDeleted", ({ collectionId }) =>
        stores.collection._deleteCollection(collectionId)
      );

      makeSocket("collectionUpdated", ({ collectionId, updates }) =>
        stores.collection.getById(collectionId)?.update(updates)
      );

      makeSocket("importBatchCompleted", () => {
        throttle(queueFileReload, 5000)();
      });

      makeSocket("importStatsUpdated", ({ importStats }) =>
        stores.import.setImportStats(importStats)
      );

      makeSocket("reloadFileCollections", () => {
        if (stores.collection.isManagerOpen) stores.collection.listFilteredCollections();
      });
    }

    if (view === "home") {
      makeSocket("reloadImportBatches", () => stores.import.loadImportBatches());
    }
  };

  useEffect(() => {
    setupSockets();
    return () => (socket.disconnect(), null);
  }, []);
};
