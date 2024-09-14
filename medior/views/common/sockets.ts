import { useEffect } from "react";
import { SocketEmitEvent, SocketEmitEvents } from "medior/_generated/socket";
import { useStores } from "medior/store";
import { connectSocket, socket, throttle } from "medior/utils";

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
      ? stores.file.search.setHasQueuedReload(true)
      : stores.file.search.loadFiltered();

  const setupSockets = () => {
    connectSocket();

    makeSocket("onFilesDeleted", ({ fileHashes, fileIds }) => {
      if (view === "carousel") stores.carousel.removeFiles(fileIds);
      else {
        if (view === "home") stores.import.addDeletedFileHashes(fileHashes);
        if (stores.collection.manager.isOpen) stores.collection.manager.search.loadFiltered();
        queueFileReload();
      }
    });

    makeSocket("onFilesUpdated", ({ fileIds, updates }) => {
      stores.file.updateFiles(fileIds, updates);

      if (view !== "carousel") {
        const updatedKeys = Object.keys(updates);
        const shouldReload =
          updatedKeys.some((k) => ["isArchived", "tagIds"].includes(k)) ||
          updatedKeys.includes(stores.file.search.sortValue.key);
        if (shouldReload) queueFileReload();
      }
    });

    makeSocket("onFileTagsUpdated", ({ addedTagIds, batchId, fileIds, removedTagIds }) => {
      stores.file.updateFileTags({ addedTagIds, fileIds, removedTagIds });

      if (view !== "carousel") queueFileReload();
      if (view === "home" && batchId?.length > 0)
        stores.import.editBatchTags({
          addedIds: addedTagIds,
          batchIds: [batchId],
          removedIds: removedTagIds,
        });
    });

    makeSocket("onReloadFiles", () => {
      if (view === "carousel")
        stores.file.search.loadFiltered({ ids: stores.carousel.selectedFileIds });
      else queueFileReload();
    });

    makeSocket("onReloadTags", () => stores.tag.loadTags());

    makeSocket("onTagCreated", (tag) => {
      stores.tag._addTag(tag);
      if (view !== "carousel" && stores.tag.manager.isOpen)
        stores.tag.manager.search.loadFiltered();
    });

    makeSocket("onTagDeleted", ({ id }) => {
      stores.tag._deleteTag(id);
      if (view === "home") stores.import.editBatchTags({ removedIds: [id] });
      if (view !== "carousel") {
        queueFileReload();
        if (stores.tag.manager.isOpen) stores.tag.manager.search.loadFiltered();
      }
    });

    makeSocket("onTagMerged", ({ oldTagId }) => {
      if (view === "home") stores.import.editBatchTags({ removedIds: [oldTagId] });
      if (view !== "carousel" && stores.tag.manager.isOpen)
        stores.tag.manager.search.loadFiltered();
    });

    makeSocket("onTagsUpdated", ({ tags, withFileReload }) => {
      tags.forEach((t) => stores.tag.getById(t.tagId)?.update(t.updates));
      if (withFileReload && view !== "carousel") throttle(queueFileReload, 2000)();
    });

    if (view === "carousel") {
      makeSocket("onFilesArchived", ({ fileIds }) => stores.carousel.removeFiles(fileIds));
    } else {
      makeSocket("onFileCollectionUpdated", ({ id, updates }) => {
        if (stores.collection.manager.isOpen)
          stores.collection.manager.getById(id)?.update(updates);
        if (stores.collection.editor.collection?.id === id)
          stores.collection.editor.collection.update(updates);
      });

      makeSocket("onImportBatchCompleted", () => {
        stores.file.search.setHasChanges(true);
      });

      makeSocket("onImportStatsUpdated", ({ importStats }) =>
        stores.import.setImportStats(importStats)
      );

      makeSocket("onReloadFileCollections", () => {
        if (stores.collection.manager.isOpen) stores.collection.manager.search.loadFiltered();
      });
    }

    if (view === "home") {
      makeSocket("onReloadImportBatches", () => stores.import.loadImportBatches());
    }
  };

  useEffect(() => {
    setupSockets();
    return () => (socket.disconnect(), null);
  }, []);
};
