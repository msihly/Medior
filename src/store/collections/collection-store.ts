import { computed } from "mobx";
import {
  _async,
  _await,
  clone,
  getRootStore,
  model,
  Model,
  modelAction,
  ModelCreationData,
  modelFlow,
  prop,
} from "mobx-keystone";
import { File, RootStore, SelectedImageTypes, SelectedVideoTypes, TagOption } from "store";
import * as db from "database";
import { SortMenuProps } from "components";
import { FileCollection, FileCollectionFile } from ".";
import {
  getConfig,
  handleErrors,
  LogicalOp,
  makePerfLog,
  makeQueue,
  PromiseQueue,
  trpc,
} from "utils";
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
  addFileToActiveCollection(file: File) {
    const index = this.editorFiles.length;
    this.editorFiles.push(new FileCollectionFile({ file: clone(file), id: file.id, index }));
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
    this.isEditorOpen = isOpen;
  }

  @modelAction
  setIsManagerOpen(isOpen: boolean) {
    this.isManagerOpen = isOpen;
    if (isOpen) this.isEditorOpen = false;
  }

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  createCollection = _async(function* (
    this: FileCollectionStore,
    { fileIdIndexes, title, withSub = true }: db.CreateCollectionInput
  ) {
    return yield* _await(
      handleErrors(async () => {
        const res = await trpc.createCollection.mutate({ fileIdIndexes, title, withSub });
        if (!res.success) throw new Error(res.error);

        this._addCollection(res.data);
        toast.success(`Collection "${title}" created!`);

        return res.data;
      })
    );
  });

  @modelFlow
  deleteCollection = _async(function* (this: FileCollectionStore, id: string) {
    return yield* _await(
      handleErrors(async () => {
        const res = await trpc.deleteCollection.mutate({ id });
        if (!res.success) throw new Error(res.error);
        this._deleteCollection(id);
      })
    );
  });

  @modelFlow
  loadActiveCollection = _async(function* (this: FileCollectionStore) {
    return yield* _await(
      handleErrors(async () => {
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
      })
    );
  });

  @modelFlow
  listFilteredCollections = _async(function* (
    this: FileCollectionStore,
    { page }: { page?: number } = {}
  ) {
    return yield* _await(
      handleErrors(async () => {
        const debug = false;
        const { perfLog, perfLogTotal } = makePerfLog("[LFC]");

        const rootStore = getRootStore<RootStore>(this);
        if (!rootStore) throw new Error("RootStore not found");
        const { tagStore } = rootStore;

        this.setIsManagerLoading(true);

        const collectionsRes = await trpc.listFilteredCollections.mutate({
          ...tagStore.tagSearchOptsToIds(this.managerTagSearchValue),
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

        this.setIsManagerLoading(false);
        if (debug) perfLogTotal(`Loaded ${collections.length} collections`);

        return collections;
      })
    );
  });

  @modelFlow
  loadSearchResults = _async(function* (
    this: FileCollectionStore,
    { page }: { page?: number } = {}
  ) {
    return yield* _await(
      handleErrors(async () => {
        const config = getConfig();
        const rootStore = getRootStore<RootStore>(this);
        const { tagStore } = rootStore;

        const filteredRes = await trpc.listFilteredFiles.mutate({
          ...tagStore.tagSearchOptsToIds(this.editorSearchValue),
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
      })
    );
  });

  @modelFlow
  loadManagerFiles = _async(function* (this: FileCollectionStore) {
    return yield* _await(
      handleErrors(async () => {
        const res = await trpc.listFiles.mutate({ ids: this.managerFileIds });
        if (!res.success) throw new Error(res.error);
        this.setManagerFiles(res.data.map((f) => new File(f)));
      })
    );
  });

  @modelFlow
  regenAllCollMeta = _async(function* (this: FileCollectionStore) {
    return yield* _await(
      handleErrors(async () => {
        const collectionIdsRes = await trpc.listAllCollectionIds.mutate();
        if (!collectionIdsRes.success) throw new Error(collectionIdsRes.error);

        makeQueue({
          action: (id) => this.regenCollMeta([id]),
          items: collectionIdsRes.data,
          logSuffix: "collections",
          onComplete: this.listFilteredCollections,
          queue: this.metaRefreshQueue,
        });
      })
    );
  });

  @modelFlow
  regenCollMeta = _async(function* (this: FileCollectionStore, collIds: string[]) {
    return yield* _await(
      handleErrors(async () => {
        const res = await trpc.regenCollAttrs.mutate({ collIds });
        if (!res.success) throw new Error(res.error);
        return res.data;
      })
    );
  });

  @modelFlow
  updateCollection = _async(function* (
    this: FileCollectionStore,
    updates: ModelCreationData<FileCollection>
  ) {
    return yield* _await(
      handleErrors(async () => {
        const res = await trpc.updateCollection.mutate(updates);
        if (!res.success) throw new Error(res.error);
        this.getById(updates.id).update(updates);

        if (this.editorId === updates.id) this.loadActiveCollection();
      })
    );
  });

  /* --------------------------------- DYNAMIC GETTERS -------------------------------- */
  getById(id: string) {
    return this.collections.find((c) => c.id === id);
  }

  getFileById(id: string) {
    return this.editorFiles.find((f) => f.id === id);
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
    const rootStore = getRootStore<RootStore>(this);
    return this.activeTagIds
      .map((id) => rootStore.tagStore.getById(id))
      .filter((t) => t)
      .sort((a, b) => b.count - a.count);
  }
}
