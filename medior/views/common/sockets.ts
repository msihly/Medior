import { useEffect, useMemo, useRef } from "react";
import { SocketEmitEvent, SocketEmitEvents } from "medior/_generated/server/socket";
import type { BackgroundOperationSchema, TagSchema } from "medior/_generated/server/models";
import {
  FileCollectionSearch,
  FileSearch,
  TagOption,
  TagSearch,
  tagToOption,
  useStores,
} from "medior/store";
import { getImportTagIndex } from "medior/store/imports/import-tag-index";
import { updatesAffectSearch } from "medior/utils/client/search-updates";
import { isDeepEqual, throttle } from "medior/utils/common";
import { socket } from "medior/utils/server";

export interface UseSocketsProps {
  enabled?: boolean;
  view: "carousel" | "home" | "search";
}

export const useSockets = ({ enabled = true, view }: UseSocketsProps) => {
  const debug = false;

  const stores = useStores();
  const pendingReloads = useRef(new Set<FileCollectionSearch | FileSearch | TagSearch>());

  const reloadSearches = useMemo(
    () =>
      throttle(() => {
        for (const search of pendingReloads.current) {
          if (search === stores.file.search && stores._getIsBlockingModalOpen())
            stores.file.search.setHasQueuedReload(true);
          else if (
            search === stores.collection.manager.search &&
            stores.collection.manager.isRelatedQueueOpen
          )
            stores.collection.manager.search.setHasQueuedReload(true);
          else search.loadFiltered();
        }

        pendingReloads.current.clear();
      }, 2000),
    [stores],
  );

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

  const queueSearchReload = (search: FileCollectionSearch | FileSearch | TagSearch) => {
    search.setHasChanges(true);
    pendingReloads.current.add(search);
    reloadSearches();
  };

  const updateSearch = (
    search: FileCollectionSearch | FileSearch | TagSearch,
    updatedKeys: string[],
  ) => {
    if (!updatedKeys.length) return;

    search.setHasChanges(true);
    if (updatesAffectSearch(search, updatedKeys)) queueSearchReload(search);
  };

  const getActiveFileSearches = () => [
    ...(view === "home" || view === "search" ? [stores.file.search] : []),
    ...(stores.collection.editor.isOpen
      ? [stores.collection.editor.search, stores.collection.editor.fileSearch]
      : []),
  ];

  const reloadTagManager = () => {
    if (stores.tag.manager.isOpen) queueSearchReload(stores.tag.manager.search);
  };

  const refreshOpenTagEditors = (tagIds: string[]) => {
    [stores.tag.editor, stores.tag.subEditor].forEach((editor) => {
      if (editor.isOpen && editor.tag?.id && tagIds.includes(editor.tag.id)) {
        editor.loadTag({ id: editor.tag.id, preserveChanges: true });
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
        editor.loadTag({ id: newTagId, preserveChanges: true });
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
    if (!isDeepEqual(options, nextOptions)) setOptions(nextOptions);
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

  const updateVisibleTagData = (updates: Map<string, Partial<TagSchema>>) => {
    const updateTags = (tags: TagSchema[], setTags: (tags: TagSchema[]) => void) => {
      if (
        tags.some((tag) =>
          Object.entries(updates.get(tag.id) ?? {}).some(
            ([key, value]) => !isDeepEqual(tag[key], value),
          ),
        )
      )
        setTags(
          tags.map((tag) => (updates.has(tag.id) ? { ...tag, ...updates.get(tag.id) } : tag)),
        );
    };

    for (const file of stores.file.search.results) updateTags(file.tags, file.setTags);

    if (stores.collection.editor.isOpen) {
      for (const file of stores.collection.editor.search.results)
        updateTags(file.tags, file.setTags);

      for (const file of stores.collection.editor.fileSearch.results)
        updateTags(file.tags, file.setTags);

      const collection = stores.collection.editor.collection;
      if (collection) updateTags(collection.tags, collection.setTags);
    }

    if (stores.collection.manager.isOpen) {
      for (const file of stores.collection.manager.selectedFiles)
        updateTags(file.tags, file.setTags);

      for (const collection of stores.collection.manager.search.results)
        updateTags(collection.tags, collection.setTags);

      for (const collection of stores.collection.manager.currentCollections)
        updateTags(collection.tags, collection.setTags);
    }
  };

  const removeFilterTagOptions = (tagIds: string[]) => {
    const removedIds = new Set(tagIds);
    const remove = (options: TagOption[], setOptions: (options: TagOption[]) => void) =>
      setOptions(options.filter((tag) => !removedIds.has(tag.id)));

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

      const retainedSearchType =
        options.find((tag) => tag.id === newTagId)?.searchType ??
        options.find((tag) => tag.id === oldTagId)?.searchType ??
        newTag.searchType;

      const replacement = { ...newTag, searchType: retainedSearchType };

      const seen = new Set<string>();
      const nextOptions = options
        .map((tag) => (tag.id === oldTagId || tag.id === newTagId ? replacement : tag))
        .filter((tag) => {
          if (seen.has(tag.id)) return false;
          seen.add(tag.id);
          return true;
        });
      setOptions(nextOptions);
    };

    replace(stores.file.search.tags, stores.file.search.setTags);
    replace(stores.collection.manager.search.tags, stores.collection.manager.search.setTags);
    replace(stores.collection.editor.search.tags, stores.collection.editor.search.setTags);
    replace(stores.collection.editor.fileSearch.tags, stores.collection.editor.fileSearch.setTags);
    replace(stores.tag.manager.search.tags, stores.tag.manager.search.setTags);
  };

  const reloadVisibleTagChips = (fileIds?: string[]) => {
    stores.file.search.results.forEach((file) => {
      if (!fileIds || fileIds.includes(file.id)) file.reloadTags();
    });

    if (stores.collection.editor.isOpen) {
      stores.collection.editor.search.results.forEach((file) => {
        if (!fileIds || fileIds.includes(file.id)) file.reloadTags();
      });
      stores.collection.editor.fileSearch.results.forEach((file) => {
        if (!fileIds || fileIds.includes(file.id)) file.reloadTags();
      });
      if (!fileIds) stores.collection.editor.collection?.reloadTags();
    }

    if (stores.collection.manager.isOpen) {
      stores.collection.manager.selectedFiles.forEach((file) => {
        if (!fileIds || fileIds.includes(file.id)) file.reloadTags();
      });

      if (!fileIds) {
        stores.collection.manager.search.results.forEach((collection) => collection.reloadTags());
        stores.collection.manager.currentCollections.forEach((collection) =>
          collection.reloadTags(),
        );
      }
    }
  };

  const setupSockets = () => {
    socket.connect();

    makeSocket("onBackgroundOperationUpdated", ({ id, updates }) => {
      const current = stores.home.backgroundOperations.find((operation) => operation.id === id);
      if (current || (updates?.type && updates.dateCreated))
        stores.home.updateBackgroundOperation({
          ...current,
          ...updates,
          id,
        } as BackgroundOperationSchema);
      else stores.home.loadBackgroundActivity();
    });

    makeSocket("onNotificationCreated", stores.home.addNotification);

    makeSocket("onNotificationsRead", ({ ids }) => stores.home.markNotificationsRead(ids));

    makeSocket("onFileRefreshProgress", stores.file.handleFileRefreshProgress);

    makeSocket("onFilesArchived", ({ fileIds }) => {
      if (view === "carousel" || stores.collection.manager.isTriagerOpen)
        stores.carousel.removeFiles(fileIds);

      if (view !== "carousel") {
        stores.file.search.removeFiles(fileIds);
        stores.file.videoTransformer.removeQueueFiles(fileIds);

        if (stores.file.videoTransformer.isOpen) {
          stores.file.videoTransformer.loadQueueCount();
          stores.file.videoTransformer.loadActiveTransform();
        }
      }
    });

    makeSocket("onFilesDeleted", ({ fileHashes, fileIds }) => {
      stores.file.updateArchivedFileIds(fileIds, false);
      if (view === "carousel" || stores.collection.manager.isTriagerOpen)
        stores.carousel.removeFiles(fileIds);

      if (view !== "carousel") {
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
      if (view !== "carousel") {
        getActiveFileSearches().forEach((search) => {
          const visibleFiles = fileIds.map((id) => search.getResult(id)).filter(Boolean);
          if (!visibleFiles.length) return;

          updateSearch(
            search,
            Object.keys(updates).filter((key) =>
              visibleFiles.some((file) => !isDeepEqual(file[key], updates[key])),
            ),
          );
        });
      }

      stores.file.updateVisibleFiles(fileIds, updates);

      for (const id of fileIds) {
        stores.file.videoTransformer.search.files.get(id)?.update(updates);
        if (stores.file.videoTransformer.activeFile?.id === id)
          stores.file.videoTransformer.activeFile.update(updates);
      }

      if (typeof updates.isArchived === "boolean")
        stores.file.updateArchivedFileIds(fileIds, updates.isArchived);

      if (view !== "carousel") {
        if (updates.tagIds) reloadVisibleTagChips(fileIds);
      }
    });

    makeSocket("onFileTagsUpdated", ({ addedTagIds, fileIds = [], removedTagIds }) => {
      stores.file.updateFileTags({ addedTagIds, fileIds, removedTagIds });
      stores.collection.editor.search.updateFileTags({ addedTagIds, fileIds, removedTagIds });
      stores.collection.editor.fileSearch.updateFileTags({
        addedTagIds,
        fileIds,
        removedTagIds,
      });
      reloadVisibleTagChips(fileIds);

      if (view !== "carousel") {
        getActiveFileSearches().forEach(
          (search) =>
            fileIds.some((id) => search.getResult(id)) &&
            updateSearch(search, ["tagIds", "tagIdsWithAncestors"]),
        );
      }
    });

    makeSocket("onReloadFiles", () => {
      if (view === "carousel") {
        stores.file.search.setIds(stores.carousel.selectedFileIds);
        queueSearchReload(stores.file.search);
      } else stores.file.search.setHasChanges(true);
    });

    makeSocket("onTagCreated", (tag) => {
      getImportTagIndex(stores).add(tag);
      stores.tag.updateCategorySources([{ tagId: tag.id, updates: tag }]);
      reloadTagManager();
    });

    makeSocket("onReloadTags", () => {
      getImportTagIndex(stores).clear();
      stores.tag.loadCategorySources();
      reloadTagManager();
    });

    makeSocket("onTagDeleted", ({ ids }) => {
      getImportTagIndex(stores).clear();
      stores.tag.loadCategorySources();
      closeDeletedTagEditors(ids);
      removeFilterTagOptions(ids);

      if (view !== "carousel") {
        updateSearch(stores.file.search, ["tagIds", "tagIdsWithAncestors"]);
        reloadVisibleTagChips();
        reloadTagManager();
      }
    });

    makeSocket("onTagMerged", (args) => {
      getImportTagIndex(stores).clear();
      stores.tag.loadCategorySources();
      handleMergedTagEditors(args);
      replaceMergedFilterTagOptions(args);

      if (view !== "carousel") reloadVisibleTagChips();

      reloadTagManager();
    });

    makeSocket("onTagUpdated", ({ id, updates }) => {
      getImportTagIndex(stores).update([{ tagId: id, updates }]);
      stores.tag.updateCategorySources([{ tagId: id, updates }]);
      const visibleTag = stores.tag.manager.search.getResult(id);

      if (stores.tag.manager.isOpen && visibleTag) {
        const changedKeys = Object.keys(updates).filter(
          (key) => !isDeepEqual(visibleTag[key], updates[key]),
        );
        updateSearch(stores.tag.manager.search, changedKeys);
        if (changedKeys.length) visibleTag.update(updates);
      }

      const tagUpdates = new Map<string, Partial<TagOption>>([[id, updates]]);
      updateFilterTagOptions(tagUpdates);
      updateVisibleTagData(new Map([[id, updates]]));
      refreshOpenTagEditors([id]);
    });

    makeSocket("onTagsUpdated", ({ tags, withFileReload }) => {
      getImportTagIndex(stores).update(tags);
      stores.tag.updateCategorySources(tags);
      tags = tags.filter(
        ({ updates }) =>
          (withFileReload && !Object.keys(updates).length) ||
          Object.keys(updates).some((key) => !["ancestorIds", "descendantIds"].includes(key)),
      );
      if (!tags.length) return;

      if (stores.tag.manager.isOpen)
        updateSearch(stores.tag.manager.search, [
          ...new Set(
            tags.flatMap(({ tagId, updates }) =>
              Object.keys(updates).filter((key) => {
                const visibleTag = stores.tag.manager.search.getResult(tagId);
                return visibleTag && !isDeepEqual(visibleTag[key], updates[key]);
              }),
            ),
          ),
        ]);

      if (stores.tag.manager.isOpen) {
        for (const { tagId, updates } of tags) {
          const visibleTag = stores.tag.manager.search.getResult(tagId);
          if (
            visibleTag &&
            Object.keys(updates).some((key) => !isDeepEqual(visibleTag[key], updates[key]))
          )
            visibleTag.update(updates);
        }
      }

      const tagUpdates = new Map(tags.map(({ tagId, updates }) => [tagId, updates]));
      const tagIds = tags.map(({ tagId }) => tagId);

      updateFilterTagOptions(tagUpdates);
      updateVisibleTagData(tagUpdates);
      refreshOpenTagEditors(tagIds);

      if (withFileReload && view !== "carousel") {
        [
          ...getActiveFileSearches(),
          ...(stores.collection.manager.isOpen ? [stores.collection.manager.search] : []),
          ...(stores.tag.manager.isOpen ? [stores.tag.manager.search] : []),
        ].forEach((search) => {
          search.setHasChanges(true);

          const filters = (search.cachedFilterProps ?? search.getFilterProps()) as Record<
            string,
            any
          >;
          if (
            [...(filters.excludedDescTagIds ?? []), ...(filters.requiredDescTagIds ?? [])].some(
              (id) => tagIds.includes(id),
            )
          )
            queueSearchReload(search);
        });
      }
    });

    if (view !== "carousel") {
      makeSocket("onFileCollectionsDeleted", ({ ids }) => {
        const removedIds = new Set(ids);
        if (
          stores.collection.editor.isOpen &&
          ids.includes(stores.collection.editor.collection?.id)
        ) {
          stores.collection.editor.setIsOpen(false);
        }

        if (stores.collection.manager.isOpen) {
          stores.collection.manager.search.setSelectedIds(
            stores.collection.manager.search.selectedIds.filter((id) => !removedIds.has(id)),
          );
          stores.collection.manager.setCurrentCollections(
            stores.collection.manager.currentCollections.filter(
              (collection) => !removedIds.has(collection.id),
            ),
          );
          if (stores.collection.manager.isRelatedQueueOpen)
            stores.collection.manager.search.setHasQueuedReload(true);
          else queueSearchReload(stores.collection.manager.search);
        }
      });

      makeSocket("onFileCollectionUpdated", ({ id, updates }) => {
        if (stores.collection.manager.isOpen) {
          const collection = stores.collection.manager.search.getResult(id);

          if (collection) {
            updateSearch(
              stores.collection.manager.search,
              Object.keys(updates).filter((key) => !isDeepEqual(collection[key], updates[key])),
            );
            collection.update(updates);
          }

          const currentCollection = stores.collection.manager.currentCollections.find(
            (c) => c.id === id,
          );
          if (currentCollection) currentCollection.update(updates);
        }

        if (stores.collection.editor.isOpen && id === stores.collection.editor.collection?.id) {
          stores.collection.editor.collection.update(updates);
        }
      });

      makeSocket("onImportBatchCompleted", ({ id }) => {
        stores.file.search.setHasChanges(true);

        if (view === "home") {
          if (stores.import.manager.activeBatch?.id === id) {
            stores.import.manager.setActiveBatch(null);
            stores.import.manager.setActiveFilePath(null);
            if (stores.import.manager.isOpen) stores.import.manager.loadActiveBatch();
          }

          stores.import.manager.search.setHasChanges(true);
        }
      });

      makeSocket("onImporterStatusUpdated", () => {
        stores.import.manager.getImporterStatus();
      });

      makeSocket("onReloadFileCollections", () => {
        if (stores.collection.manager.isOpen) stores.collection.manager.search.setHasChanges(true);
      });
    }

    makeSocket("onFileTransformerStatusUpdated", async () => {
      const store = stores.file.videoTransformer;
      if (!store.isOpen) return;

      const wasTransforming = store.isTransforming;
      const status = await store.getTransformerStatus();
      if (!status?.success || !status.data || !store.isOpen) return;

      if (wasTransforming && !store.isTransforming && !store.isUpdating) {
        await store.loadActiveTransform(store.focusedTransformId ?? undefined);
      }

      await store.loadQueueCount();
    });

    makeSocket("onFileTransformLoaded", (args) => {
      if (stores.file.videoTransformer.isOpen)
        stores.file.videoTransformer.receiveActiveTransform(args);
    });

    makeSocket("onFileTransformDeleted", ({ ids }) => {
      const store = stores.file.videoTransformer;
      if (!store.isOpen) return;

      const activeDeleted = ids.includes(store.activeTransform?.id);
      store.removeQueueFiles([], ids);
      if (activeDeleted) store.loadActiveTransform();

      store.loadQueueCount();
    });

    makeSocket("onFileTransformUpdated", ({ id, updates }) => {
      stores.file.videoTransformer.receiveTransformUpdate(id, updates);
    });

    makeSocket("onReloadFileTransforms", ({ reason }) => {
      const store = stores.file.videoTransformer;
      if (!store.isOpen || store.isUpdating) return;

      store.loadQueueCount();
      if (reason !== "created" || !store.search.forcePages) store.loadQueue();
    });

    if (view === "home") {
      makeSocket("onFileImportProgress", ({ batchId, elapsed, filePath, message, progress }) => {
        const store = stores.import.manager;
        if (batchId && store.activeBatch && store.activeBatch.id !== batchId) return;
        store.setActiveFilePath(filePath);
        store.setActiveFileProgress({ elapsed, message, progress });
      });

      makeSocket("onFileImportUpdated", ({ batchId, errorMsg, fileId, filePath, status }) => {
        if (stores.import.manager.activeFilePath === filePath)
          stores.import.manager.setActiveFileProgress(null);
        if (stores.import.manager.activeBatch?.id === batchId)
          stores.import.manager.activeBatch.updateImport(
            { originalPath: filePath },
            { errorMsg, fileId, status },
          );
      });

      makeSocket("onFileImportStarted", ({ filePath }) => {
        stores.import.manager.setActiveFilePath(filePath);
        stores.import.manager.setActiveFileProgress(null);
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
    if (!enabled) return;

    setupSockets();
    socket.on("connected", () => {
      getImportTagIndex(stores).clear();
      stores.tag.loadCategorySources();
    });
    getImportTagIndex(stores).clear();
    if (socket.isConnected()) stores.tag.loadCategorySources();

    return () => {
      pendingReloads.current.clear();
      socket.disconnect();
    };
  }, [enabled]);
};
