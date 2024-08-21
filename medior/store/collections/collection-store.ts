import { toast } from "react-toastify";
import { computed } from "mobx";
import {
  clone,
  ExtendedModel,
  getRootStore,
  model,
  modelAction,
  ModelCreationData,
  modelFlow,
  prop,
} from "mobx-keystone";
import { asyncAction, File, RootStore, SelectedImageTypes, SelectedVideoTypes } from "medior/store";
import { _FileCollectionStore } from "medior/store/_generated";
import * as db from "medior/database";
import { CollectionEditor, CollectionManager, FileCollection, FileCollectionFile } from ".";
import { getConfig, makePerfLog, makeQueue, PromiseQueue, trpc } from "medior/utils";
import { arrayMove } from "@alissavrk/dnd-kit-sortable";

@model("medior/FileCollectionStore")
export class FileCollectionStore extends ExtendedModel(_FileCollectionStore, {
  collectionFitMode: prop<"cover" | "contain">("contain").withSetter(),
  editor: prop<CollectionEditor>(() => new CollectionEditor({})),
  isConfirmDeleteOpen: prop<boolean>(false).withSetter(),
  manager: prop<CollectionManager>(() => new CollectionManager({})),
  selectedCollectionId: prop<string>(null).withSetter(),
}) {
  metaRefreshQueue = new PromiseQueue();

  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  _addCollection(collection: ModelCreationData<FileCollection>) {
    if (!this.getById(collection.id)) this.fileCollections.push(new FileCollection(collection));
  }

  @modelAction
  _deleteCollection(id: string) {
    this.fileCollections = this.fileCollections.filter((c) => c.id !== id);
  }

  @modelAction
  addFilesToActiveCollection(files: File[]) {
    const startIndex = this.editor.files.length;
    this.editor.files.push(
      ...files.map(
        (file, idx) =>
          new FileCollectionFile({ file: clone(file), id: file.id, index: startIndex + idx })
      )
    );
    this.editor.setHasUnsavedChanges(true);
    this.loadSearchResults();
  }

  @modelAction
  clearSearch() {
    this.editor.search.page = 1;
    this.editor.search.pageCount = 1;
    this.editor.search.results = [];
    this.editor.search.sort = { isDesc: true, key: "dateModified" };
    this.editor.search.value = [];
  }

  @modelAction
  getShiftSelectedIds(clickedId: string): { idsToDeselect: string[]; idsToSelect: string[] } {
    if (this.editor.selectedIds.length === 0)
      return { idsToDeselect: [], idsToSelect: [clickedId] };
    if (this.editor.selectedIds.length === 1 && this.editor.selectedIds[0] === clickedId)
      return { idsToDeselect: [clickedId], idsToSelect: [] };

    const clickedIndex = this.editor.files.findIndex((f) => f.id === clickedId);
    const editorFileIds = this.editor.files.map((f) => f.id);

    const firstSelectedIndex = editorFileIds.indexOf(this.editor.selectedIds[0]);
    const lastSelectedIndex = editorFileIds.indexOf(
      this.editor.selectedIds[this.editor.selectedIds.length - 1]
    );

    if (clickedIndex > firstSelectedIndex && clickedIndex < lastSelectedIndex) {
      const distanceToStart = clickedIndex - firstSelectedIndex;
      const distanceToEnd = lastSelectedIndex - clickedIndex;

      return {
        idsToDeselect:
          distanceToStart < distanceToEnd
            ? editorFileIds.slice(firstSelectedIndex, clickedIndex)
            : editorFileIds.slice(clickedIndex + 1, lastSelectedIndex + 1),
        idsToSelect: [],
      };
    } else {
      const startIndex = Math.min(firstSelectedIndex, clickedIndex);
      const endIndex = Math.max(lastSelectedIndex, clickedIndex);
      return { idsToDeselect: [], idsToSelect: editorFileIds.slice(startIndex, endIndex + 1) };
    }
  }

  @modelAction
  moveFileIndex(fromFileId: string, toFileId: string) {
    const fileIdIndexes = this.editor.files.map((f) => ({ id: f.id, index: f.index }));
    const [from, to] = [fromFileId, toFileId].map((id) => fileIdIndexes.find((f) => f.id === id));
    if (!from || !to) return console.error(`Missing file for ${fromFileId} or ${toFileId}`);
    if (from.index === to.index) return console.debug("Indexes are the same, no move needed");

    this.editor.setFiles(
      arrayMove(fileIdIndexes, from.index, to.index).map(
        (f, i) =>
          new FileCollectionFile({
            file: clone(this.getFileById(f.id).file),
            id: f.id,
            index: i,
          })
      )
    );

    this.editor.setHasUnsavedChanges(true);
  }

  @modelAction
  overwrite(collections: ModelCreationData<FileCollection>[]) {
    this.fileCollections = collections.map((f) => new FileCollection(f));
  }

  @modelAction
  setIsEditorOpen(isOpen: boolean) {
    this.editor.selectedIds = [];
    this.editor.isOpen = isOpen;
  }

  @modelAction
  setIsManagerOpen(isOpen: boolean) {
    this.manager.isOpen = isOpen;
    if (isOpen) this.editor.isOpen = false;
  }

  @modelAction
  toggleFilesSelected(selected: { id: string; isSelected?: boolean }[], withToast = false) {
    if (!selected?.length) return;

    const [added, removed] = selected.reduce(
      (acc, cur) => (acc[cur.isSelected ? 0 : 1].push(cur.id), acc),
      [[], []]
    );

    const removedSet = new Set(removed);
    this.editor.selectedIds = [...new Set(this.editor.selectedIds.concat(added))].filter(
      (id) => !removedSet.has(id)
    );

    if (withToast)
      toast.info(
        `${added.length ? `${added.length} files selected.` : ""}${
          added.length && removed.length ? "\n" : ""
        }${removed.length ? `${removed.length} files deselected.` : ""}`
      );
  }

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  confirmDelete = asyncAction(async () => {
    const res = await this.deleteCollection(this.editor.id);
    if (!res.success) throw new Error("Failed to delete collection");
    else {
      this.editor.setId(null);
      this.setIsEditorOpen(false);
      toast.success("Collection deleted");
    }
  });

  @modelFlow
  createCollection = asyncAction(
    async ({ fileIdIndexes, title, withSub = true }: db.CreateCollectionInput) => {
      const res = await trpc.createCollection.mutate({ fileIdIndexes, title, withSub });
      if (!res.success) throw new Error(res.error);

      this._addCollection(res.data);
      toast.success(`Collection "${title}" created!`);

      return res.data;
    }
  );

  @modelFlow
  deleteCollection = asyncAction(async (id: string) => {
    const res = await trpc.deleteCollection.mutate({ id });
    if (!res.success) throw new Error(res.error);
    this._deleteCollection(id);
  });

  @modelFlow
  deleteEmptyCollections = asyncAction(async () => {
    const res = await trpc.deleteEmptyCollections.mutate();
    if (!res.success) throw new Error(res.error);
    toast.success(`Deleted ${res.data} empty collections`);

    await this.listFilteredCollections();
  });

  @modelFlow
  loadActiveCollection = asyncAction(async () => {
    const fileIdIndexes = this.activeCollection.fileIdIndexes.map(({ fileId, index }) => ({
      fileId,
      index,
    }));

    const fileIds = fileIdIndexes.map(({ fileId }) => fileId);
    const res = await trpc.listFiles.mutate({ args: { filter: { ids: fileIds } } });

    if (!res.success) toast.error(res.error);
    else
      this.editor.setFiles(
        res.data.items
          .map(
            (f) =>
              new FileCollectionFile({
                file: new File(f),
                id: f.id,
                index: this.activeCollection.getIndexById(f.id),
              })
          )
          .sort((a, b) => a.index - b.index)
      );
  });

  @modelFlow
  listFilteredCollections = asyncAction(async ({ page }: { page?: number } = {}) => {
    const debug = false;
    const { perfLog, perfLogTotal } = makePerfLog("[LFC]");

    const stores = getRootStore<RootStore>(this);
    if (!stores) throw new Error("RootStore not found");
    this.manager.setIsLoading(true);

    const collectionsRes = await trpc.listFilteredCollections.mutate({
      ...stores.tag.tagSearchOptsToIds(this.manager.tagSearchValue),
      isSortDesc: this.manager.searchSort.isDesc,
      page: page ?? this.manager.searchPage,
      pageSize: getConfig().collection.editorPageSize,
      sortKey: this.manager.searchSort.key,
      title: this.manager.titleSearchValue,
    });
    if (!collectionsRes.success) throw new Error(collectionsRes.error);

    const { collections, pageCount } = collectionsRes.data;
    if (debug) perfLog(`Loaded ${collections.length} filtered collections`);

    this.overwrite(collections);
    if (debug) perfLog("CollectionStore.collections overwrite and re-render");

    this.manager.setSearchPageCount(pageCount);
    if (page) this.manager.setSearchPage(page);
    if (debug)
      perfLog(`Set page to ${page ?? this.manager.searchPage} and pageCount to ${pageCount}`);

    this.setSelectedCollectionId(null);
    this.manager.setIsLoading(false);
    if (debug) perfLogTotal(`Loaded ${collections.length} collections`);

    return collections;
  });

  @modelFlow
  loadSearchResults = asyncAction(async ({ page }: { page?: number } = {}) => {
    const config = getConfig();
    const stores = getRootStore<RootStore>(this);

    const filteredRes = await trpc.listFilteredFiles.mutate({
      ...stores.tag.tagSearchOptsToIds(this.editor.search.value),
      excludedFileIds: this.editor.files.map((f) => f.id),
      hasDiffParams: this.editor.search.hasDiffParams,
      isArchived: false,
      isSortDesc: this.editor.search.sort.isDesc,
      numOfTagsOp: this.editor.search.numOfTagsOp,
      numOfTagsValue: this.editor.search.numOfTagsValue,
      page: page ?? this.editor.search.page,
      pageSize: getConfig().collection.searchFileCount,
      selectedImageTypes: Object.fromEntries(
        config.file.imageTypes.map((ext) => [ext, true])
      ) as SelectedImageTypes,
      selectedVideoTypes: Object.fromEntries(
        config.file.videoTypes.map((ext) => [ext, true])
      ) as SelectedVideoTypes,
      sortKey: this.editor.search.sort.key,
    });
    if (!filteredRes.success) throw new Error(filteredRes.error);

    const { files, pageCount } = filteredRes.data;

    this.editor.search.setResults(files.map((f) => new File(f)));
    this.editor.search.setPageCount(pageCount);
    if (page) this.editor.search.setPage(page);

    return files;
  });

  @modelFlow
  loadManagerFiles = asyncAction(async () => {
    const res = await trpc.listFiles.mutate({ args: { filter: { ids: this.manager.fileIds } } });
    if (!res.success) throw new Error(res.error);
    this.manager.setFiles(res.data.items.map((f) => new File(f)));
  });

  @modelFlow
  regenAllCollMeta = asyncAction(async () => {
    const collectionIdsRes = await trpc.listAllCollectionIds.mutate();
    if (!collectionIdsRes.success) throw new Error(collectionIdsRes.error);

    makeQueue({
      action: async (id) => {
        const res = await trpc.regenCollAttrs.mutate({ collIds: [id] });
        if (!res.success) throw new Error(res.error);
      },
      items: collectionIdsRes.data,
      logSuffix: "collections",
      onComplete: this.listFilteredCollections,
      queue: this.metaRefreshQueue,
    });
  });

  @modelFlow
  regenCollMeta = asyncAction(async (collIds: string[]) => {
    this.editor.setIsLoading(true);
    const res = await trpc.regenCollAttrs.mutate({ collIds });
    this.editor.setIsLoading(false);
    if (!res.success) throw new Error(res.error);
    toast.success("Metadata refreshed!");
  });

  @modelFlow
  updateCollection = asyncAction(async (updates: db.UpdateCollectionInput) => {
    const res = await trpc.updateCollection.mutate(updates);
    if (!res.success) throw new Error(res.error);
    this.getById(updates.id).update(updates);

    if (this.editor.id === updates.id) this.loadActiveCollection();
  });

  /* --------------------------------- DYNAMIC GETTERS -------------------------------- */
  getById(id: string) {
    return this.fileCollections.find((c) => c.id === id);
  }

  getFileById(id: string) {
    return this.editor.files.find((f) => f.id === id);
  }

  getIsSelected(id: string) {
    return !!this.editor.selectedIds.find((s) => s === id);
  }

  listByFileId(id: string) {
    return this.fileCollections.filter((c) => c.fileIdIndexes.find((f) => f.fileId === id));
  }

  /* --------------------------------- GETTERS -------------------------------- */
  @computed
  get activeCollection() {
    return this.fileCollections.find((c) => c.id === this.editor.id);
  }

  @computed
  get activeTagIds() {
    return [...new Set(this.editor.files.flatMap((f) => f.file?.tagIds ?? []))];
  }

  @computed
  get sortedEditorFiles() {
    return [...this.editor.files].sort((a, b) => a.index - b.index);
  }

  @computed
  get sortedActiveTags() {
    const stores = getRootStore<RootStore>(this);
    return stores.tag.listByIds(this.activeTagIds).sort((a, b) => b.count - a.count);
  }
}
