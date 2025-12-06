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

    makeSocket("onFileTagsUpdated", ({ addedTagIds, fileIds, removedTagIds }) => {
      stores.file.updateFileTags({ addedTagIds, fileIds, removedTagIds });
      stores.file.search.reloadTags(fileIds);

      if (view !== "carousel") stores.file.search.setHasChanges(true);
    });

    makeSocket("onReloadFiles", () => {
      if (view === "carousel") {
        stores.file.search.setIds(stores.carousel.selectedFileIds);
        stores.file.search.loadFiltered();
      } else queueFileReload();
    });

    makeSocket("onTagCreated", () => {
      if (view !== "carousel" && stores.tag.manager.isOpen)
        stores.tag.manager.search.loadFiltered();
    });

    makeSocket("onTagDeleted", () => {
      if (view !== "carousel") {
        queueFileReload();
        if (stores.tag.manager.isOpen) stores.tag.manager.search.loadFiltered();
      }
    });

    makeSocket("onTagMerged", () => {
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
        if (view === "home") {
          stores.import.manager.setActiveBatch(null);
          stores.import.manager.setActiveFilePath(null);
          stores.import.manager.search.setHasChanges(true);
        }
      });

      makeSocket("onImporterStatusUpdated", () => {
        stores.import.manager.getImporterStatus();
      });

      makeSocket("onReloadFileCollections", () => {
        if (stores.collection.manager.isOpen) stores.collection.manager.search.loadFiltered();
      });
    }

    if (view === "home") {
      makeSocket("onFileImportUpdated", ({ errorMsg, fileId, filePath, status }) => {
        if (stores.import.manager.isOpen)
          stores.import.manager.activeBatch?.updateImport?.(
            { originalPath: filePath },
            { errorMsg, fileId, status },
          );
      });

      makeSocket("onFileImportStarted", ({ filePath }) => {
        if (stores.import.manager.isOpen) stores.import.manager.setActiveFilePath(filePath);
      });

      makeSocket("onImportBatchLoaded", () => {
        if (stores.import.manager.isOpen) stores.import.manager.loadActiveBatch();
      });

      makeSocket("onReloadImportBatches", () => {
        if (stores.import.manager.isOpen) stores.import.manager.search.setHasQueuedReload(true);
      });
    }
  };

  useEffect(() => {
    setupSockets();
    return () => (socket.disconnect(), null);
  }, []);
};
