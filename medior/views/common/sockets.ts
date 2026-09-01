import { useEffect } from "react";
import { SocketEmitEvent, SocketEmitEvents } from "medior/_generated/server/socket";
import { TagOption, tagToOption, useStores } from "medior/store";
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
  ) => debug && console.debug(`[SOCKET] ${eventName}`, eventArgs);

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

  const reloadTagManager = () => {
    if (stores.tag.manager.isOpen) stores.tag.manager.search.loadFiltered();
  };

  const refreshOpenTagEditors = (tagIds: string[]) => {
    [stores.tag.editor, stores.tag.subEditor].forEach((editor) => {
      if (editor.isOpen && editor.tag?.id && tagIds.includes(editor.tag.id)) {
        editor.loadTag(editor.tag.id);
      }
    });
  };

  const handleMergedTagEditors = ({
    newTagId,
    oldTagId,
  }: {
    newTagId: string;
    oldTagId: string;
  }) => {
    [stores.tag.editor, stores.tag.subEditor].forEach((editor) => {
      if (!editor.isOpen || !editor.tag?.id) return;

      if (editor.tag.id === oldTagId || editor.tag.id === newTagId) {
        editor.loadTag(newTagId);
      }
    });
  };

  const closeDeletedTagEditors = (tagIds: string[]) => {
    [stores.tag.editor, stores.tag.subEditor].forEach((editor) => {
      if (editor.isOpen && editor.tag?.id && tagIds.includes(editor.tag.id)) {
        editor.setIsOpen(false);
      }
    });
  };

  const updateTagOptions = (
    options: TagOption[],
    setOptions: (options: TagOption[]) => void,
    updates: Map<string, Partial<TagOption>>,
  ) => {
    const nextOptions = options.map((option) =>
      updates.has(option.id) ? { ...option, ...updates.get(option.id) } : option,
    );
    setOptions(nextOptions);
  };

  const updateFilterTagOptions = (updates: Map<string, Partial<TagOption>>) => {
    updateTagOptions(stores.file.search.tags, stores.file.search.setTags, updates);
    updateTagOptions(
      stores.collection.manager.search.tags,
      stores.collection.manager.search.setTags,
      updates,
    );
    updateTagOptions(
      stores.collection.editor.search.tags,
      stores.collection.editor.search.setTags,
      updates,
    );
    updateTagOptions(
      stores.collection.editor.fileSearch.tags,
      stores.collection.editor.fileSearch.setTags,
      updates,
    );
    updateTagOptions(stores.tag.manager.search.tags, stores.tag.manager.search.setTags, updates);
  };

  const removeFilterTagOptions = (tagIds: string[]) => {
    const remove = (options: TagOption[], setOptions: (options: TagOption[]) => void) =>
      setOptions(options.filter((tag) => !tagIds.includes(tag.id)));

    remove(stores.file.search.tags, stores.file.search.setTags);
    remove(stores.collection.manager.search.tags, stores.collection.manager.search.setTags);
    remove(stores.collection.editor.search.tags, stores.collection.editor.search.setTags);
    remove(stores.collection.editor.fileSearch.tags, stores.collection.editor.fileSearch.setTags);
    remove(stores.tag.manager.search.tags, stores.tag.manager.search.setTags);
  };

  const replaceMergedFilterTagOptions = async ({
    newTagId,
    oldTagId,
  }: {
    newTagId: string;
    oldTagId: string;
  }) => {
    const res = await stores.tag.listByIds({ ids: [newTagId] });
    if (!res.success || !res.data.length) return;

    const newTag = tagToOption(res.data[0]);
    const replace = (options: TagOption[], setOptions: (options: TagOption[]) => void) => {
      if (!options.some((tag) => tag.id === oldTagId || tag.id === newTagId)) return;

      const nextOptions = options
        .map((tag) => (tag.id === oldTagId || tag.id === newTagId ? newTag : tag))
        .filter((tag, index, arr) => arr.findIndex((t) => t.id === tag.id) === index);
      setOptions(nextOptions);
    };

    replace(stores.file.search.tags, stores.file.search.setTags);
    replace(stores.collection.manager.search.tags, stores.collection.manager.search.setTags);
    replace(stores.collection.editor.search.tags, stores.collection.editor.search.setTags);
    replace(stores.collection.editor.fileSearch.tags, stores.collection.editor.fileSearch.setTags);
    replace(stores.tag.manager.search.tags, stores.tag.manager.search.setTags);
  };

  const reloadVisibleTagChips = () => {
    stores.file.search.results.forEach((file) => file.reloadTags());
    stores.collection.editor.search.results.forEach((file) => file.reloadTags());
    stores.collection.editor.fileSearch.results.forEach((file) => file.reloadTags());
    stores.collection.manager.selectedFiles.forEach((file) => file.reloadTags());
    stores.collection.manager.search.results.forEach((collection) => collection.reloadTags());
    stores.collection.manager.currentCollections.forEach((collection) => collection.reloadTags());
    stores.collection.editor.collection?.reloadTags();
  };

  const updateVisibleFiles = (
    fileIds: string[],
    updates: Parameters<typeof stores.file.updateFiles>[1],
  ) => {
    stores.file.updateFiles(fileIds, updates);
    stores.collection.editor.updateFiles(fileIds, updates);
    stores.collection.manager.selectedFiles.forEach((file) => {
      if (fileIds.includes(file.id)) file.update(updates);
    });
    stores.collection.editor.fileSearch.results.forEach((file) => {
      if (fileIds.includes(file.id)) file.update(updates);
    });
    stores.collection.manager.search.files.forEach((file) => {
      if (fileIds.includes(file.id)) file.update(updates);
    });
  };

  const setupSockets = () => {
    socket.connect();

    makeSocket("onFilesArchived", ({ fileIds }) => {
      if (view === "carousel") stores.carousel.removeFiles(fileIds);
      else {
        stores.file.search.removeFiles(fileIds);
        stores.file.videoTransformer.removeQueueFiles(fileIds);
        if (stores.file.videoTransformer.isOpen) {
          stores.file.videoTransformer.loadQueueCount();
          stores.file.videoTransformer.loadActiveTransform();
        }
      }
    });

    makeSocket("onFilesDeleted", ({ fileHashes, fileIds }) => {
      if (view === "carousel") stores.carousel.removeFiles(fileIds);
      else {
        if (view === "home") stores.import.addDeletedFileHashes(fileHashes);
        if (stores.collection.manager.isOpen) stores.collection.manager.search.setHasChanges(true);
        if (stores.collection.editor.isOpen) stores.collection.editor.search.setHasChanges(true);
        stores.file.search.removeFiles(fileIds);
        stores.file.videoTransformer.removeQueueFiles(fileIds);
        if (stores.file.videoTransformer.isOpen) {
          stores.file.videoTransformer.loadQueueCount();
          stores.file.videoTransformer.loadActiveTransform();
        }
        stores.file.search.setHasChanges(true);
      }
    });

    makeSocket("onFilesUpdated", ({ fileIds, updates }) => {
      updateVisibleFiles(fileIds, updates);

      if (view !== "carousel") {
        const updatedKeys = Object.keys(updates);
        const shouldReload =
          updatedKeys.some((k) => ["isArchived", "tagIds"].includes(k)) ||
          updatedKeys.includes(stores.file.search.sortValue.key) ||
          updatedKeys.includes(stores.collection.editor.search.sortValue.key) ||
          updatedKeys.includes(stores.collection.editor.fileSearch.sortValue.key);
        if (shouldReload) {
          stores.file.search.setHasChanges(true);
          stores.collection.editor.search.setHasChanges(true);
          stores.collection.editor.fileSearch.setHasChanges(true);
        }

        if (updates.tagIds) reloadVisibleTagChips();
      }
    });

    makeSocket("onFileTagsUpdated", ({ addedTagIds, fileIds, removedTagIds }) => {
      stores.file.updateFileTags({ addedTagIds, fileIds, removedTagIds });
      stores.file.search.reloadTags(fileIds);
      stores.collection.editor.search.reloadTags(fileIds);
      stores.collection.editor.fileSearch.reloadTags(fileIds);
      reloadVisibleTagChips();

      if (view !== "carousel") {
        stores.file.search.setHasChanges(true);
        stores.collection.editor.search.setHasChanges(true);
      }
    });

    makeSocket("onReloadFiles", () => {
      if (view === "carousel") {
        stores.file.search.setIds(stores.carousel.selectedFileIds);
        stores.file.search.loadFiltered();
      } else queueFileReload();
    });

    makeSocket("onTagCreated", () => {
      reloadTagManager();
    });

    makeSocket("onTagDeleted", ({ ids }) => {
      closeDeletedTagEditors(ids);
      removeFilterTagOptions(ids);

      if (view !== "carousel") {
        queueFileReload();
        reloadVisibleTagChips();
        reloadTagManager();
      }
    });

    makeSocket("onTagMerged", (args) => {
      handleMergedTagEditors(args);
      replaceMergedFilterTagOptions(args);

      if (view !== "carousel") reloadVisibleTagChips();
      reloadTagManager();
    });

    makeSocket("onTagUpdated", ({ id, updates }) => {
      const tagUpdates = new Map<string, Partial<TagOption>>([[id, updates]]);
      updateFilterTagOptions(tagUpdates);
      refreshOpenTagEditors([id]);
      reloadVisibleTagChips();
      reloadTagManager();
    });

    makeSocket("onTagsUpdated", ({ tags, withFileReload }) => {
      const tagUpdates = new Map(tags.map(({ tagId, updates }) => [tagId, updates]));
      const tagIds = tags.map(({ tagId }) => tagId);

      updateFilterTagOptions(tagUpdates);
      refreshOpenTagEditors(tagIds);
      reloadVisibleTagChips();

      if (withFileReload && view !== "carousel") throttle(queueFileReload, 2000)();
      reloadTagManager();
    });

    if (view !== "carousel") {
      makeSocket("onFileCollectionsDeleted", ({ ids }) => {
        if (
          stores.collection.editor.isOpen &&
          ids.includes(stores.collection.editor.collection?.id)
        ) {
          stores.collection.editor.setIsOpen(false);
        }

        if (stores.collection.manager.isOpen) {
          stores.collection.manager.search.setSelectedIds(
            stores.collection.manager.search.selectedIds.filter((id) => !ids.includes(id)),
          );
          stores.collection.manager.setCurrentCollections(
            stores.collection.manager.currentCollections.filter(
              (collection) => !ids.includes(collection.id),
            ),
          );
          stores.collection.manager.search.loadFiltered();
        }
      });

      makeSocket("onFileCollectionUpdated", ({ id, updates }) => {
        if (stores.collection.manager.isOpen) {
          stores.collection.manager.search.setHasChanges(true);
          const collection = stores.collection.manager.search.getResult(id);
          if (collection) collection.update(updates);

          const currentCollection = stores.collection.manager.currentCollections.find(
            (c) => c.id === id,
          );
          if (currentCollection) currentCollection.update(updates);
        }

        if (stores.collection.editor.isOpen && id === stores.collection.editor.collection?.id)
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

    makeSocket("onFileTransformerStatusUpdated", () => {
      stores.file.videoTransformer.getTransformerStatus();
      stores.file.videoTransformer.loadQueueCount();
    });

    makeSocket("onFileTransformLoaded", ({ id }) => {
      if (stores.file.videoTransformer.isOpen) stores.file.videoTransformer.loadActiveTransform(id);
    });

    makeSocket("onFileTransformUpdated", ({ id, updates }) => {
      const isConsumed = ["REPLACED", "SAVED"].includes(updates.status);
      const isTerminal = updates.isCompleted || ["ERROR", "SKIPPED"].includes(updates.status);
      const transform = stores.file.videoTransformer.search.getResult(id);
      const fileId = transform?.fileId;

      if (stores.file.videoTransformer.activeTransform?.id === id) {
        stores.file.videoTransformer.activeTransform.update(updates);
        if (isConsumed) {
          stores.file.videoTransformer.setFocusedTransformId(null);
          stores.file.videoTransformer.loadActiveTransform();
        }
        if (isTerminal) {
          stores.file.videoTransformer.setIsPaused(false);
          stores.file.videoTransformer.setIsTransforming(false);
          stores.file.videoTransformer.loadActiveTransform(id);
        }
      } else if (stores.file.videoTransformer.isOpen && updates.status === "RUNNING") {
        stores.file.videoTransformer.loadActiveTransform(id);
      }

      if (isConsumed) {
        stores.file.videoTransformer.search._deleteResults([id]);
        if (fileId) stores.file.videoTransformer.removeQueueFiles([fileId]);
      } else transform?.update(updates);

      if (updates.isCompleted || ["ERROR", "REPLACED", "SAVED"].includes(updates.status))
        stores.file.videoTransformer.search.setHasChanges(true);
      stores.file.videoTransformer.loadQueueCount();
    });

    makeSocket("onReloadFileTransforms", () => {
      if (stores.file.videoTransformer.isOpen) {
        stores.file.videoTransformer.loadQueueCount();
        stores.file.videoTransformer.loadQueue();
      }
    });

    if (view === "home") {
      makeSocket("onFileImportUpdated", ({ errorMsg, fileId, filePath, status }) => {
        if (stores.import.manager.isOpen)
          stores.import.manager.activeBatch?.updateImport?.(
            { originalPath: filePath },
            { errorMsg, fileId, status },
          );
      });

      makeSocket("onFileImportStarted", ({ filePath }) => {
        stores.import.manager.setActiveFilePath(filePath);
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
