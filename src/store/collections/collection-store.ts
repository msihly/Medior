import { computed } from "mobx";
import {
  clone,
  getRootStore,
  model,
  Model,
  modelAction,
  ModelCreationData,
  modelFlow,
  prop,
} from "mobx-keystone";
import {
  asyncAction,
  File,
  RootStore,
  SelectedImageTypes,
  SelectedVideoTypes,
  TagOption,
} from "store";
import * as db from "database";
import { SortMenuProps } from "components";
import { FileCollection, FileCollectionFile } from ".";
import { getConfig, LogicalOp, makePerfLog, makeQueue, PromiseQueue, trpc } from "utils";
import { toast } from "react-toastify";
import { arrayMove } from "@alissavrk/dnd-kit-sortable";

@model("medior/FileCollectionStore")
export class FileCollectionStore extends Model({
  collectionFitMode: prop<"cover" | "contain">("contain").withSetter(),
  collections: prop<FileCollection[]>(() => []).withSetter(),
  editorFiles: prop<FileCollectionFile[]>(() => []).withSetter(),
  editorId: prop<string>(null).withSetter(),
  editorSearchHasDiffParams: prop<boolean>(false).withSetter(),
  editorSearchNumOfTagsOp: prop<LogicalOp | "">("").withSetter(),
  editorSearchNumOfTagsValue: prop<number>(0).withSetter(),
  editorSearchPage: prop<number>(1).withSetter(),
  editorSearchPageCount: prop<number>(1).withSetter(),
  editorSearchResults: prop<File[]>(() => []).withSetter(),
  editorSearchSort: prop<SortMenuProps["value"]>(
    () => getConfig().collection.editorSearchSort
  ).withSetter(),
  editorSearchValue: prop<TagOption[]>(() => []).withSetter(),
  editorSelectedIds: prop<string[]>(() => []).withSetter(),
  editorWithSelectedFiles: prop<boolean>(false).withSetter(),
  hasUnsavedChanges: prop<boolean>(false).withSetter(),
  isEditorOpen: prop<boolean>(false),
  isManagerLoading: prop<boolean>(false).withSetter(),
  isManagerOpen: prop<boolean>(false),
  managerSearchPage: prop<number>(1).withSetter(),
  managerSearchPageCount: prop<number>(1).withSetter(),
  managerSearchResults: prop<FileCollection[]>(() => []).withSetter(),
  managerSearchSort: prop<SortMenuProps["value"]>(
    () => getConfig().collection.managerSearchSort
  ).withSetter(),
  managerFileIds: prop<string[]>(() => []).withSetter(),
  managerFiles: prop<File[]>(() => []).withSetter(),
  managerTagSearchValue: prop<TagOption[]>(() => []).withSetter(),
  managerTitleSearchValue: prop<string>("").withSetter(),
  selectedCollectionId: prop<string>(null).withSetter(),
}) {
  metaRefreshQueue = new PromiseQueue();

  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  _addCollection(collection: ModelCreationData<FileCollection>) {
    if (!this.getById(collection.id)) this.collections.push(new FileCollection(collection));
  }

  @modelAction
  _deleteCollection(id: string) {
    this.collections = this.collections.filter((c) => c.id !== id);
  }

  @modelAction
  addFilesToActiveCollection(files: File[]) {
    const startIndex = this.editorFiles.length;
    this.editorFiles.push(
      ...files.map(
        (file, idx) =>
          new FileCollectionFile({ file: clone(file), id: file.id, index: startIndex + idx })
      )
    );
    this.setHasUnsavedChanges(true);
    this.loadSearchResults();
  }

  @modelAction
  clearSearch() {
    this.editorSearchPage = 1;
    this.editorSearchPageCount = 1;
    this.editorSearchResults = [];
    this.editorSearchSort = { isDesc: true, key: "dateModified" };
    this.editorSearchValue = [];
  }

  @modelAction
  getShiftSelectedIds(clickedId: string): { idsToDeselect: string[]; idsToSelect: string[] } {
    if (this.editorSelectedIds.length === 0) return { idsToDeselect: [], idsToSelect: [clickedId] };
    if (this.editorSelectedIds.length === 1 && this.editorSelectedIds[0] === clickedId)
      return { idsToDeselect: [clickedId], idsToSelect: [] };

    const clickedIndex = this.editorFiles.findIndex((f) => f.id === clickedId);
    const editorFileIds = this.editorFiles.map((f) => f.id);

    const firstSelectedIndex = editorFileIds.indexOf(this.editorSelectedIds[0]);
    const lastSelectedIndex = editorFileIds.indexOf(
      this.editorSelectedIds[this.editorSelectedIds.length - 1]
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
    const fileIdIndexes = this.editorFiles.map((f) => ({ id: f.id, index: f.index }));
    const [from, to] = [fromFileId, toFileId].map((id) => fileIdIndexes.find((f) => f.id === id));
    if (!from || !to) return console.error(`Missing file for ${fromFileId} or ${toFileId}`);
    if (from.index === to.index) return console.debug("Indexes are the same, no move needed");

    this.setEditorFiles(
      arrayMove(fileIdIndexes, from.index, to.index).map(
        (f, i) =>
          new FileCollectionFile({
            file: clone(this.getFileById(f.id).file),
            id: f.id,
            index: i,
          })
      )
    );

    this.setHasUnsavedChanges(true);
  }

  @modelAction
  overwrite(collections: ModelCreationData<FileCollection>[]) {
    this.collections = collections.map((f) => new FileCollection(f));
  }

  @modelAction
  setIsEditorOpen(isOpen: boolean) {
    this.editorSelectedIds = [];
    this.isEditorOpen = isOpen;
  }

  @modelAction
  setIsManagerOpen(isOpen: boolean) {
    this.isManagerOpen = isOpen;
    if (isOpen) this.isEditorOpen = false;
  }

  @modelAction
  toggleFilesSelected(selected: { id: string; isSelected?: boolean }[], withToast = false) {
    if (!selected?.length) return;

    const [added, removed] = selected.reduce(
      (acc, cur) => (acc[cur.isSelected ? 0 : 1].push(cur.id), acc),
      [[], []]
    );

    const removedSet = new Set(removed);
    this.editorSelectedIds = [...new Set(this.editorSelectedIds.concat(added))].filter(
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
  loadActiveCollection = asyncAction(async () => {
    const fileIdIndexes = this.activeCollection.fileIdIndexes.map(({ fileId, index }) => ({
      fileId,
      index,
    }));

    const fileIds = fileIdIndexes.map(({ fileId }) => fileId);
    const res = await trpc.listFiles.mutate({ ids: fileIds });

    if (!res.success) toast.error(res.error);
    else
      this.setEditorFiles(
        res.data
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
    this.setIsManagerLoading(true);

    const collectionsRes = await trpc.listFilteredCollections.mutate({
      ...stores.tag.tagSearchOptsToIds(this.managerTagSearchValue),
      isSortDesc: this.managerSearchSort.isDesc,
      page: page ?? this.managerSearchPage,
      pageSize: getConfig().collection.editorPageSize,
      sortKey: this.managerSearchSort.key,
      title: this.managerTitleSearchValue,
    });
    if (!collectionsRes.success) throw new Error(collectionsRes.error);

    const { collections, pageCount } = collectionsRes.data;
    if (debug) perfLog(`Loaded ${collections.length} filtered collections`);

    this.overwrite(collections);
    if (debug) perfLog("CollectionStore.collections overwrite and re-render");

    this.setManagerSearchPageCount(pageCount);
    if (page) this.setManagerSearchPage(page);
    if (debug)
      perfLog(`Set page to ${page ?? this.managerSearchPage} and pageCount to ${pageCount}`);

    this.setSelectedCollectionId(null);
    this.setIsManagerLoading(false);
    if (debug) perfLogTotal(`Loaded ${collections.length} collections`);

    return collections;
  });

  @modelFlow
  loadSearchResults = asyncAction(async ({ page }: { page?: number } = {}) => {
    const config = getConfig();
    const stores = getRootStore<RootStore>(this);

    const filteredRes = await trpc.listFilteredFiles.mutate({
      ...stores.tag.tagSearchOptsToIds(this.editorSearchValue),
      excludedFileIds: this.editorFiles.map((f) => f.id),
      hasDiffParams: this.editorSearchHasDiffParams,
      isArchived: false,
      isSortDesc: this.editorSearchSort.isDesc,
      numOfTagsOp: this.editorSearchNumOfTagsOp,
      numOfTagsValue: this.editorSearchNumOfTagsValue,
      page: page ?? this.editorSearchPage,
      pageSize: getConfig().collection.searchFileCount,
      selectedImageTypes: Object.fromEntries(
        config.file.imageTypes.map((ext) => [ext, true])
      ) as SelectedImageTypes,
      selectedVideoTypes: Object.fromEntries(
        config.file.videoTypes.map((ext) => [ext, true])
      ) as SelectedVideoTypes,
      sortKey: this.editorSearchSort.key,
    });
    if (!filteredRes.success) throw new Error(filteredRes.error);

    const { files, pageCount } = filteredRes.data;

    this.setEditorSearchResults(files.map((f) => new File(f)));
    this.setEditorSearchPageCount(pageCount);
    if (page) this.setEditorSearchPage(page);

    return files;
  });

  @modelFlow
  loadManagerFiles = asyncAction(async () => {
    const res = await trpc.listFiles.mutate({ ids: this.managerFileIds });
    if (!res.success) throw new Error(res.error);
    this.setManagerFiles(res.data.map((f) => new File(f)));
  });

  @modelFlow
  regenAllCollMeta = asyncAction(async () => {
    const collectionIdsRes = await trpc.listAllCollectionIds.mutate();
    if (!collectionIdsRes.success) throw new Error(collectionIdsRes.error);

    makeQueue({
      action: (id) => this.regenCollMeta([id]),
      items: collectionIdsRes.data,
      logSuffix: "collections",
      onComplete: this.listFilteredCollections,
      queue: this.metaRefreshQueue,
    });
  });

  @modelFlow
  regenCollMeta = asyncAction(async (collIds: string[]) => {
    const res = await trpc.regenCollAttrs.mutate({ collIds });
    if (!res.success) throw new Error(res.error);
    return res.data;
  });

  @modelFlow
  updateCollection = asyncAction(async (updates: db.UpdateCollectionInput) => {
    const res = await trpc.updateCollection.mutate(updates);
    if (!res.success) throw new Error(res.error);
    this.getById(updates.id).update(updates);

    if (this.editorId === updates.id) this.loadActiveCollection();
  });

  /* --------------------------------- DYNAMIC GETTERS -------------------------------- */
  getById(id: string) {
    return this.collections.find((c) => c.id === id);
  }

  getFileById(id: string) {
    return this.editorFiles.find((f) => f.id === id);
  }

  getIsSelected(id: string) {
    return !!this.editorSelectedIds.find((s) => s === id);
  }

  listByFileId(id: string) {
    return this.collections.filter((c) => c.fileIdIndexes.find((f) => f.fileId === id));
  }

  /* --------------------------------- GETTERS -------------------------------- */
  @computed
  get activeCollection() {
    return this.collections.find((c) => c.id === this.editorId);
  }

  @computed
  get activeTagIds() {
    return [...new Set(this.editorFiles.flatMap((f) => f.file?.tagIds ?? []))];
  }

  @computed
  get sortedEditorFiles() {
    return [...this.editorFiles].sort((a, b) => a.index - b.index);
  }

  @computed
  get sortedActiveTags() {
    const stores = getRootStore<RootStore>(this);
    return stores.tag.listByIds(this.activeTagIds).sort((a, b) => b.count - a.count);
  }
}
