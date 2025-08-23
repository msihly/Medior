import { useEffect } from "react";
import { SocketEmitEvent, SocketEmitEvents } from "medior/_generated/socket";
import { useStores } from "medior/store";
import { throttle } from "medior/utils/common";
import { socket } from "medior/utils/server";

export interface UseSocketsProps {
  view: "carousel" | "home" | "search";
}

export const useSockets = ({ view }: UseSocketsProps) => {
  const debug = false;

  const stores = useStores();

  const debugLog = (
    eventName: SocketEmitEvent,
    eventArgs: Parameters<SocketEmitEvents[SocketEmitEvent]>[0],
  ) => debug && console.debug(`[Socket] ${eventName}`, eventArgs);

  const makeSocket = <T extends SocketEmitEvent>(
    eventName: T,
    callback: (args: Parameters<SocketEmitEvents[T]>[0]) => void,
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
    socket.connect();

    makeSocket("onFilesArchived", ({ fileIds }) =>
      view === "carousel"
        ? stores.carousel.removeFiles(fileIds)
        : stores.file.search.removeFiles(fileIds),
    );

    makeSocket("onFilesDeleted", ({ fileHashes, fileIds }) => {
      if (view === "carousel") stores.carousel.removeFiles(fileIds);
      else {
        if (view === "home") stores.import.addDeletedFileHashes(fileHashes);
        if (stores.collection.manager.isOpen) stores.collection.manager.search.setHasChanges(true);
        if (stores.collection.editor.isOpen) stores.collection.editor.search.setHasChanges(true);
        stores.file.search.removeFiles(fileIds);
        stores.file.search.setHasChanges(true);
      }
    });

    makeSocket("onFilesUpdated", ({ fileIds, updates }) => {
      stores.file.updateFiles(fileIds, updates);

      if (view !== "carousel") {
        const updatedKeys = Object.keys(updates);
        const shouldReload =
          updatedKeys.some((k) => ["isArchived", "tagIds"].includes(k)) ||
          updatedKeys.includes(stores.file.search.sortValue.key);
        if (shouldReload) stores.file.search.setHasChanges(true);

        if (stores.collection.editor.isOpen) stores.collection.editor.updateFiles(fileIds, updates);
      }
    });

    makeSocket("onFileTagsUpdated", ({ addedTagIds, batchId, fileIds, removedTagIds }) => {
      stores.file.updateFileTags({ addedTagIds, fileIds, removedTagIds });
      stores.file.search.reloadTags(fileIds);

      if (view !== "carousel") stores.file.search.setHasChanges(true);
      if (view === "home" && batchId?.length > 0)
        stores.import.manager.editBatchTags({
          addedIds: addedTagIds,
          batchIds: [batchId],
          removedIds: removedTagIds,
        });
    });

    makeSocket("onReloadFiles", () => {
      if (view === "carousel") {
        stores.file.search.setIds(stores.carousel.selectedFileIds);
        stores.file.search.loadFiltered();
      } else queueFileReload();
    });

    makeSocket("onReloadTags", () => stores.tag.loadTags());

    makeSocket("onTagCreated", (tag) => {
      stores.tag._addTag(tag);
      if (view !== "carousel" && stores.tag.manager.isOpen)
        stores.tag.manager.search.loadFiltered();
    });

    makeSocket("onTagDeleted", ({ ids }) => {
      ids.forEach((id) => stores.tag._deleteTag(id));
      if (view === "home") stores.import.manager.editBatchTags({ removedIds: ids });
      if (view !== "carousel") {
        queueFileReload();
        if (stores.tag.manager.isOpen) stores.tag.manager.search.loadFiltered();
      }
    });

    makeSocket("onTagMerged", ({ oldTagId }) => {
      if (view === "home") stores.import.manager.editBatchTags({ removedIds: [oldTagId] });
      if (view !== "carousel" && stores.tag.manager.isOpen)
        stores.tag.manager.search.loadFiltered();
    });

    makeSocket("onTagsUpdated", ({ withFileReload }) => {
      if (withFileReload && view !== "carousel") throttle(queueFileReload, 2000)();
    });

    if (view !== "carousel") {
      makeSocket("onFileCollectionsDeleted", () => {
        if (stores.collection.manager.isOpen) stores.collection.manager.search.loadFiltered();
      });

      makeSocket("onFileCollectionUpdated", ({ id, updates }) => {
        if (stores.collection.manager.isOpen) {
          stores.collection.manager.search.setHasChanges(true);
          const collection = stores.collection.manager.search.getResult(id);
          if (collection) collection.update(updates);
        }

        if (stores.collection.editor.isOpen && id === stores.collection.editor.collection.id)
          stores.collection.editor.loadCollection(id);
      });

      makeSocket("onImportBatchCompleted", () => {
        stores.file.search.setHasChanges(true);
      });

      makeSocket("onImportStatsUpdated", ({ importStats }) =>
        stores.import.manager.setImportStats(importStats),
      );

      makeSocket("onReloadFileCollections", () => {
        if (stores.collection.manager.isOpen) stores.collection.manager.search.loadFiltered();
      });
    }

    if (view === "home") {
      makeSocket("onReloadImportBatches", () => stores.import.manager.loadImportBatches());
    }
  };

  useEffect(() => {
    setupSockets();
    return () => (socket.disconnect(), null);
  }, []);
};
