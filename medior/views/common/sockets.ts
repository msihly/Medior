import { useEffect } from "react";
import type { BackgroundOperationSchema, TagSchema } from "medior/_generated/server/models";
import { SocketEmitEvent, SocketEmitEvents } from "medior/_generated/server/socket";
import {
  FileCollectionSearch,
  FileSearch,
  MediaProgram,
  MediaProgramSearch,
  TagOption,
  TagSearch,
  tagToOption,
  useStores,
} from "medior/store";
import { getImportTagIndex } from "medior/store/imports/import-tag-index";
import {
  canEnterSearch,
  dateModifiedAffectsSearch,
  sortsAfterPage,
  tagChangesAffectSearch,
} from "medior/utils/client/search-updates";
import { reloadItemTags } from "medior/utils/client/tags";
import { isDeepEqual } from "medior/utils/common";
import { socket } from "medior/utils/server";

export interface UseSocketsProps {
  enabled?: boolean;
  view: "carousel" | "home" | "search";
}

export const useSockets = ({ enabled = true, view }: UseSocketsProps) => {
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

  /**
   * Results are updated in place and never reloaded for an update; the search shows it has
   * changes, so running it again reflects what the update moved in or out of its results.
   */
  const updateSearch = (
    search: FileCollectionSearch | FileSearch | MediaProgramSearch | TagSearch,
    updatedKeys: string[],
  ) => {
    if (updatedKeys.length) search.setHasChanges(true);
  };

  /** Removes deleted or merged-away items from a search's results and selection. */
  const removeResults = <
    Search extends {
      results: { id: string }[];
      selectedIds: string[];
      setResults: (results: Search["results"]) => void;
      setSelectedIds: (ids: string[]) => void;
    },
  >(
    search: Search,
    ids: string[],
  ) => {
    const removedIds = new Set(ids);

    if (search.results.some((result) => removedIds.has(result.id)))
      search.setResults(search.results.filter((result) => !removedIds.has(result.id)));

    if (search.selectedIds.some((id) => removedIds.has(id)))
      search.setSelectedIds(search.selectedIds.filter((id) => !removedIds.has(id)));
  };

  const getActiveFileSearches = () => [
    ...(view === "home" || view === "search" ? [stores.file.search] : []),
    ...(stores.file.similarity.isOpen ? [stores.file.similarity.search] : []),
    ...(stores.collection.editor.isOpen
      ? [stores.collection.editor.search, stores.collection.editor.fileSearch]
      : []),
    ...(stores.mediaProgram.editor.isOpen ? [stores.mediaProgram.editor.search] : []),
  ];

  /** New tags can't be placed among loaded results, so the search shows it has changes. */
  const markTagManagerChanged = () => {
    if (stores.tag.manager.isOpen) stores.tag.manager.search.setHasChanges(true);
  };

  /** Loads a visible program's tags and genres after their IDs changed. */
  const loadProgramTags = async (program: MediaProgram) => {
    const genreIds = [...program.genreIds];
    const tagIds = [...program.tagIds];
    const res = await stores.tag.listByIds({ ids: [...new Set([...genreIds, ...tagIds])] });
    if (!res.success) throw new Error(res.error);

    const tagsById = new Map(res.data.map((tag) => [tag.id, tag]));

    program.setGenres(genreIds.map((id) => tagsById.get(id)).filter(Boolean));
    program.setTags(tagIds.map((id) => tagsById.get(id)).filter(Boolean));
  };

  /**
   * Replaces a merged tag with the tag it merged into, or removes deleted tags, on every visible
   * file, collection, and program.
   */
  const replaceVisibleTags = (tagIds: string[], replacement: TagSchema = null) => {
    const replacedIds = new Set(tagIds);

    const replaceIds = (ids: string[]) => [
      ...new Set(
        ids.flatMap((id) => (!replacedIds.has(id) ? [id] : replacement ? [replacement.id] : [])),
      ),
    ];

    const replaceTags = (tags: TagSchema[]) => [
      ...new Map(
        tags
          .flatMap((tag) => (!replacedIds.has(tag.id) ? [tag] : replacement ? [replacement] : []))
          .map((tag): [string, TagSchema] => [tag.id, tag]),
      ).values(),
    ];

    const hasReplacedId = (ids: string[]) => ids.some((id) => replacedIds.has(id));
    const hasReplacedTag = (tags: { id: string }[]) => tags.some((tag) => replacedIds.has(tag.id));

    const files = [
      ...stores.file.search.results,
      ...stores.file.similarity.search.results,
      ...stores.collection.editor.search.results,
      ...stores.collection.editor.fileSearch.results,
      ...stores.collection.manager.selectedFiles,
    ];
    const collections = [
      ...(stores.collection.editor.collection ? [stores.collection.editor.collection] : []),
      ...stores.collection.manager.search.results,
      ...stores.collection.manager.currentCollections,
    ];
    const programs = [
      ...stores.mediaProgram.manager.search.results,
      ...(stores.mediaProgram.editor.program ? [stores.mediaProgram.editor.program] : []),
    ];

    for (const item of [...files, ...collections]) {
      if (hasReplacedId(item.tagIds)) item.update({ tagIds: replaceIds(item.tagIds) });

      if (hasReplacedTag(item.tags)) item.setTags(replaceTags(item.tags));
    }

    for (const program of programs) {
      if (hasReplacedId(program.genreIds))
        program.update({ genreIds: replaceIds(program.genreIds) });

      if (hasReplacedId(program.tagIds)) program.update({ tagIds: replaceIds(program.tagIds) });

      if (hasReplacedTag(program.genres)) program.setGenres(replaceTags(program.genres));

      if (hasReplacedTag(program.tags)) program.setTags(replaceTags(program.tags));
    }

    // The collection editor's header lists its own tag records, loaded again for the new ids.
    if (hasReplacedTag(stores.collection.editor.tags)) stores.collection.editor.loadTags();
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

  /** Each search's tag filter options with their setter. */
  const getFilterTagOptions = (): [TagOption[], (options: TagOption[]) => void][] => [
    [stores.file.search.tags, stores.file.search.setTags],
    [stores.collection.manager.search.tags, stores.collection.manager.search.setTags],
    [stores.collection.editor.search.tags, stores.collection.editor.search.setTags],
    [stores.collection.editor.fileSearch.tags, stores.collection.editor.fileSearch.setTags],
    [stores.mediaProgram.editor.genres, stores.mediaProgram.editor.setGenres],
    [stores.mediaProgram.manager.search.genres, stores.mediaProgram.manager.search.setGenres],
    [stores.mediaProgram.manager.search.tags, stores.mediaProgram.manager.search.setTags],
    [stores.tag.manager.search.tags, stores.tag.manager.search.setTags],
  ];

  const updateFilterTagOptions = (updates: Map<string, Partial<TagOption>>) => {
    for (const [options, setOptions] of getFilterTagOptions()) {
      const nextOptions = options.map((option) =>
        updates.has(option.id) ? { ...option, ...updates.get(option.id) } : option,
      );

      if (!isDeepEqual(options, nextOptions)) setOptions(nextOptions);
    }
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

    for (const file of stores.file.similarity.search.results) updateTags(file.tags, file.setTags);

    if (stores.collection.editor.isOpen) {
      for (const file of stores.collection.editor.search.results)
        updateTags(file.tags, file.setTags);

      for (const file of stores.collection.editor.fileSearch.results)
        updateTags(file.tags, file.setTags);

      const collection = stores.collection.editor.collection;

      if (collection) updateTags(collection.tags, collection.setTags);

      for (const tag of stores.collection.editor.tags)
        if (updates.has(tag.id)) tag.update(updates.get(tag.id));
    }

    if (stores.collection.manager.isOpen) {
      for (const file of stores.collection.manager.selectedFiles)
        updateTags(file.tags, file.setTags);

      for (const collection of stores.collection.manager.search.results)
        updateTags(collection.tags, collection.setTags);

      for (const collection of stores.collection.manager.currentCollections)
        updateTags(collection.tags, collection.setTags);
    }

    for (const program of [
      ...(stores.mediaProgram.manager.isOpen ? stores.mediaProgram.manager.search.results : []),
      ...(stores.mediaProgram.editor.program ? [stores.mediaProgram.editor.program] : []),
    ]) {
      updateTags(program.genres, program.setGenres);
      updateTags(program.tags, program.setTags);
    }
  };

  const removeFilterTagOptions = (tagIds: string[]) => {
    const removedIds = new Set(tagIds);

    for (const [options, setOptions] of getFilterTagOptions())
      setOptions(options.filter((tag) => !removedIds.has(tag.id)));
  };

  const replaceMergedFilterTagOptions = (mergedTag: TagSchema, oldTagId: string) => {
    const newTag = tagToOption(mergedTag);
    const newTagId = mergedTag.id;

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

    for (const [options, setOptions] of getFilterTagOptions()) replace(options, setOptions);
  };

  /** Loads the tag chips of updated files that are on screen. */
  const reloadVisibleTagChips = async (fileIds: string[]) => {
    const requestedIds = new Set(fileIds);
    const files = [
      ...stores.file.search.results,
      ...(stores.file.similarity.isOpen ? stores.file.similarity.search.results : []),
      ...(stores.collection.editor.isOpen
        ? [
            ...stores.collection.editor.search.results,
            ...stores.collection.editor.fileSearch.results,
          ]
        : []),
      ...(stores.collection.manager.isOpen ? stores.collection.manager.selectedFiles : []),
    ].filter((file) => requestedIds.has(file.id));

    try {
      await reloadItemTags(files);
    } catch (error) {
      console.error(error);
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

    makeSocket("onReloadBackgroundActivity", () => stores.home.loadBackgroundActivity());

    makeSocket("onFileLocksUpdated", stores.file.updateFileLocks);

    makeSocket("onJobUpdated", stores.home.updateJob);

    makeSocket("onFilesArchived", ({ fileIds }) => {
      stores.file.similarity.removeFiles(fileIds);

      if (view === "carousel" || stores.collection.manager.isTriagerOpen)
        stores.carousel.removeFiles(fileIds);

      if (view !== "carousel") {
        stores.file.search.removeFiles(fileIds);
        stores.file.videoTransformer.removeQueueFiles(fileIds);

        if (stores.file.videoTransformer.isOpen) {
          stores.file.videoTransformer.loadQueueCount();
          stores.file.videoTransformer.loadActiveTransform({ isBackground: true });
        }
      }
    });

    makeSocket("onFilesDeleted", ({ fileIds }) => {
      stores.file.similarity.removeFiles(fileIds);

      stores.file.updateArchivedFileIds(fileIds, false);

      if (view === "carousel" || stores.collection.manager.isTriagerOpen)
        stores.carousel.removeFiles(fileIds);

      if (view !== "carousel") {
        if (stores.collection.manager.isOpen) stores.collection.manager.search.setHasChanges(true);

        // The editor's collection drops them through its own update; other lists drop them here.
        stores.collection.editor.fileSearch.removeFiles(fileIds);
        stores.collection.manager.setSelectedFiles(
          stores.collection.manager.selectedFiles.filter((file) => !fileIds.includes(file.id)),
        );
        stores.file.search.removeFiles(fileIds);
        stores.file.videoTransformer.removeQueueFiles(fileIds);

        if (stores.file.videoTransformer.isOpen) {
          stores.file.videoTransformer.loadQueueCount();
          stores.file.videoTransformer.loadActiveTransform({ isBackground: true });
        }

        stores.file.search.setHasChanges(true);
      }
    });

    const handleFilesUpdated = ({
      fileIds,
      updates,
    }: Parameters<SocketEmitEvents["onFilesUpdated"]>[0]) => {
      if (view !== "carousel") {
        getActiveFileSearches().forEach((search) => {
          // Searches of fixed file lists, such as a collection's, keep their files whatever changes.
          const isIdSearch = search.forcePages || search.ids.length > 0;
          const visibleFiles = fileIds.map((id) => search.getResult(id)).filter(Boolean);
          const hasEnteringFiles =
            !isIdSearch &&
            visibleFiles.length < fileIds.length &&
            canEnterSearch(search, updates) &&
            !sortsAfterPage(search, updates);

          // Modification dates change with every edit, so they only count where the search uses them.
          updateSearch(
            search,
            Object.keys(updates).filter(
              (key) =>
                (key !== "dateModified" || dateModifiedAffectsSearch(search)) &&
                (hasEnteringFiles ||
                  visibleFiles.some((file) => !isDeepEqual(file[key], updates[key]))),
            ),
          );

          // Files whose new archive state the search filters out leave its results.
          if (!isIdSearch && !canEnterSearch(search, updates)) search.removeFiles(fileIds);
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

      if (view !== "carousel" && updates.tagIds) reloadVisibleTagChips(fileIds);
    };

    // Single-file updates, such as replaced transform outputs, refresh searches like batch updates.
    makeSocket("onFileUpdated", ({ id, updates }) =>
      handleFilesUpdated({ fileIds: [id], updates }),
    );

    makeSocket("onFilesUpdated", handleFilesUpdated);

    makeSocket("onFileTagsUpdated", ({ addedTagIds, fileIds = [], removedTagIds }) => {
      stores.file.updateFileTags({ addedTagIds, fileIds, removedTagIds });
      stores.collection.editor.search.updateFileTags({ addedTagIds, fileIds, removedTagIds });
      stores.collection.editor.fileSearch.updateFileTags({
        addedTagIds,
        fileIds,
        removedTagIds,
      });
      stores.mediaProgram.editor.search.updateFileTags({ addedTagIds, fileIds, removedTagIds });
      reloadVisibleTagChips(fileIds);

      if (view !== "carousel") {
        const changedTagIds = [...addedTagIds, ...removedTagIds];

        getActiveFileSearches().forEach((search) =>
          updateSearch(search, [
            ...(dateModifiedAffectsSearch(search) ? ["dateModified"] : []),
            ...(tagChangesAffectSearch(search, changedTagIds)
              ? ["tagIds", "tagIdsWithAncestors"]
              : []),
          ]),
        );
      }
    });

    // Files changed in bulk without their own updates leave the loaded results as they are.
    makeSocket("onReloadFiles", () => {
      if (view !== "carousel") stores.file.search.setHasChanges(true);
    });

    makeSocket("onTagCreated", (tag) => {
      getImportTagIndex(stores).add(tag);
      stores.tag.updateCategorySources([{ tagId: tag.id, updates: tag }]);
      markTagManagerChanged();
    });

    makeSocket("onReloadTags", () => {
      getImportTagIndex(stores).clear();
      stores.tag.loadCategorySources();
      markTagManagerChanged();
    });

    makeSocket("onTagDeleted", ({ ids }) => {
      getImportTagIndex(stores).clear();
      stores.tag.loadCategorySources();
      closeDeletedTagEditors(ids);
      removeFilterTagOptions(ids);
      replaceVisibleTags(ids);
      removeResults(stores.tag.manager.search, ids);

      if (view !== "carousel") stores.file.search.setHasChanges(true);
    });

    makeSocket("onTagMerged", async (args) => {
      getImportTagIndex(stores).clear();
      stores.tag.loadCategorySources();
      handleMergedTagEditors(args);
      removeResults(stores.tag.manager.search, [args.oldTagId]);

      const res = await stores.tag.listByIds({ ids: [args.newTagId] });

      if (!res.success) console.error(res.error);
      else if (res.data.length) {
        replaceMergedFilterTagOptions(res.data[0], args.oldTagId);
        replaceVisibleTags([args.oldTagId], res.data[0]);
      }
    });

    makeSocket("onTagUpdated", ({ id, updates }) => {
      getImportTagIndex(stores).update([{ tagId: id, updates }]);
      stores.tag.updateCategorySources([{ tagId: id, updates }]);

      const visibleTag = stores.tag.manager.search.getResult(id);

      if (stores.tag.manager.isOpen) {
        const changedKeys = Object.keys(updates).filter(
          (key) => !visibleTag || !isDeepEqual(visibleTag[key], updates[key]),
        );

        updateSearch(stores.tag.manager.search, changedKeys);

        if (changedKeys.length) visibleTag?.update(updates);
      }

      const tagUpdates = new Map<string, Partial<TagOption>>([[id, updates]]);

      updateFilterTagOptions(tagUpdates);
      updateVisibleTagData(tagUpdates);
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

      if (stores.tag.manager.isOpen) {
        updateSearch(stores.tag.manager.search, [
          ...new Set(
            tags.flatMap(({ tagId, updates }) =>
              Object.keys(updates).filter((key) => {
                const visibleTag = stores.tag.manager.search.getResult(tagId);

                return !visibleTag || !isDeepEqual(visibleTag[key], updates[key]);
              }),
            ),
          ),
        ]);

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
        ].forEach((search) => search.setHasChanges(true));
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
          removeResults(stores.collection.manager.search, ids);
          stores.collection.manager.setCurrentCollections(
            stores.collection.manager.currentCollections.filter(
              (collection) => !removedIds.has(collection.id),
            ),
          );
        }
      });

      makeSocket("onFileCollectionCreated", () => {
        if (stores.collection.manager.isOpen) stores.collection.manager.search.setHasChanges(true);
      });

      makeSocket("onFileCollectionUpdated", async ({ id, updates }) => {
        const editor = stores.collection.editor;
        const manager = stores.collection.manager;

        if (manager.isOpen) {
          const collection = manager.search.getResult(id);
          const currentCollection = manager.currentCollections.find((c) => c.id === id);

          updateSearch(
            manager.search,
            Object.keys(updates).filter(
              (key) => !collection || !isDeepEqual(collection[key], updates[key]),
            ),
          );
          collection?.update(updates);
          currentCollection?.update(updates);

          // New previews load beside those already shown, and new tags load as chips.
          if (updates.fileIdIndexes) manager.search.loadFiles();

          if (updates.tagIds) {
            try {
              await reloadItemTags([collection, currentCollection].filter(Boolean));
            } catch (error) {
              console.error(error);
            }
          }
        }

        if (editor.isOpen && id === editor.collection?.id) {
          if (updates.fileIdIndexes) editor.syncCollectionFiles(updates.fileIdIndexes);

          editor.collection.update(updates);

          if (updates.tagIds) editor.loadTags();
        }

        if (stores.mediaProgram.editor.isOpen) stores.mediaProgram.editor.updateSeason(id, updates);
      });

      makeSocket("onImportBatchCompleted", ({ id }) => {
        stores.file.search.setHasChanges(true);

        if (view === "home") {
          const store = stores.import.manager;

          if (store.activeBatch?.id === id) {
            store.setActiveBatch(null);

            if (store.isOpen) store.loadActiveBatch();
          }

          // The active file is kept only while a different batch is loaded.
          if (!store.activeBatch) {
            store.setActiveFilePath(null);
            store.setActiveFileProgress(null);
          }

          if (!store.search.isCompleted) store.search._deleteResults([id]);

          store.search.setHasChanges(true);
        }
      });

      makeSocket("onImporterStatusUpdated", () => {
        stores.import.manager.getImporterStatus();
      });

      // New programs can't be placed among loaded results, so the search shows it has changes.
      makeSocket("onMediaProgramCreated", () => {
        if (stores.mediaProgram.manager.isOpen)
          stores.mediaProgram.manager.search.setHasChanges(true);
      });

      makeSocket("onMediaProgramDeleted", ({ ids }) => {
        const store = stores.mediaProgram;

        if (store.editor.isOpen && ids.includes(store.editor.program?.id))
          store.editor.setIsOpen(false);

        removeResults(store.manager.search, ids);
      });

      makeSocket("onMediaProgramUpdated", async ({ id, updates }) => {
        const store = stores.mediaProgram;
        const keys = Object.keys(updates);
        const hasTagChanges = keys.includes("genreIds") || keys.includes("tagIds");
        const programs: MediaProgram[] = [];

        if (store.manager.isOpen) {
          const program = store.manager.search.getResult(id);

          updateSearch(
            store.manager.search,
            keys.filter((key) => !program || !isDeepEqual(program[key], updates[key])),
          );

          if (program) {
            program.update(updates);
            programs.push(program);
          }

          // A new poster is loaded with the rest of the page's posters.
          if (program && keys.includes("posterFileId")) store.manager.search.loadFiles();
        }

        if (store.editor.isOpen && store.editor.program?.id === id) {
          store.editor.updateProgram(updates);
          programs.push(store.editor.program);

          if (keys.includes("collectionIdIndexes")) store.editor.syncSeasons();
        }

        if (hasTagChanges) {
          try {
            await Promise.all(programs.map(loadProgramTags));

            // The editor's genre draft follows the new genres unless it has unsaved changes.
            if (store.editor.program?.id === id && !store.editor.hasUnsavedChanges)
              store.editor.resetDraft();
          } catch (error) {
            console.error(error);
          }
        }
      });

      makeSocket("onReloadFileCollections", () => {
        if (stores.collection.manager.isOpen) stores.collection.manager.search.setHasChanges(true);
      });
    }

    makeSocket("onFileTransformerStatusUpdated", async () => {
      const store = stores.file.videoTransformer;
      const wasTransforming = store.isTransforming;
      const status = await store.getTransformerStatus();

      if (!status?.success || !status.data || !store.isOpen) return;

      if (wasTransforming && !store.isTransforming && !store.isUpdating) {
        await store.loadActiveTransform({
          id: store.focusedTransformId ?? undefined,
          isBackground: true,
        });
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

      if (activeDeleted) store.loadActiveTransform({ isBackground: true });

      store.loadQueueCount();
      store.loadSizeHistory();
    });

    makeSocket("onFileTransformUpdated", ({ id, updates }) => {
      const store = stores.file.videoTransformer;

      store.receiveTransformUpdate(id, updates);

      if (store.isOpen && ("isCompleted" in updates || "status" in updates))
        store.queueSizeHistoryRefresh();
    });

    makeSocket("onReloadFileTransforms", ({ reason }) => {
      const store = stores.file.videoTransformer;

      if (!store.isOpen || store.isUpdating) return;

      store.loadQueueCount();

      if (reason !== "created" || !store.search.forcePages) store.loadQueue({ isBackground: true });
    });

    makeSocket("onSimilarAudioProgress", ({ elapsed, lookupId, message, progress }) => {
      const store = stores.file.similarity;

      if (store.lookupId === lookupId) store.setProgress({ elapsed, message, progress });
    });

    if (view === "home") {
      makeSocket("onFileImportProgress", ({ batchId, elapsed, filePath, message, progress }) => {
        const store = stores.import.manager;

        if (batchId && store.activeBatch && store.activeBatch.id !== batchId) return;

        store.setActiveFilePath(filePath);
        store.setActiveFileProgress({ elapsed, message, progress });
      });

      makeSocket("onFileImportUpdated", (update) => {
        const { batchId, filePath } = update;

        if (stores.import.manager.activeFilePath === filePath)
          stores.import.manager.setActiveFileProgress(null);

        if (stores.import.manager.activeBatch?.id === batchId)
          stores.import.manager.activeBatch.updateImport(update);

        for (const batch of stores.import.manager.search.results) {
          if (batch.id === batchId) batch.updateImport(update);
        }
      });

      makeSocket("onFileImportStarted", ({ filePath }) => {
        stores.import.manager.setActiveFilePath(filePath);
        stores.import.manager.setActiveFileProgress(null);
      });

      makeSocket("onImportBatchLoaded", () => {
        if (stores.import.manager.isOpen) stores.import.manager.loadActiveBatch();
      });

      makeSocket("onReloadImportBatches", () => {
        if (stores.import.manager.isOpen) stores.import.manager.search.setHasChanges(true);
      });
    }
  };

  useEffect(() => {
    if (!enabled) return;

    setupSockets();
    socket.on("connected", () => {
      getImportTagIndex(stores).clear();
      stores.tag.loadCategorySources();
      stores.file.loadFileLocks();
      stores.home.loadJobs();
    });
    getImportTagIndex(stores).clear();

    if (socket.isConnected()) {
      stores.tag.loadCategorySources();
      stores.file.loadFileLocks();
      stores.home.loadJobs();
    }

    return () => socket.disconnect();
  }, [enabled]);
};
