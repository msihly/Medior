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
import { getConfig, handleErrors, makePerfLog, trpc } from "utils";
import { toast } from "react-toastify";
import { arrayMove } from "@alissavrk/dnd-kit-sortable";

@model("mediaViewer/FileCollectionStore")
export class FileCollectionStore extends Model({
  activeCollectionId: prop<string>(null).withSetter(),
  activeFiles: prop<FileCollectionFile[]>(() => []).withSetter(),
  collections: prop<FileCollection[]>(() => []).withSetter(),
  editorSearchPage: prop<number>(1).withSetter(),
  editorSearchPageCount: prop<number>(1).withSetter(),
  editorSearchResults: prop<File[]>(() => []).withSetter(),
  editorSearchSort: prop<SortMenuProps["value"]>(
    () => getConfig().collection.editorSearchSort
  ).withSetter(),
  editorSearchValue: prop<TagOption[]>(() => []).withSetter(),
  hasUnsavedChanges: prop<boolean>(false).withSetter(),
  isEditorOpen: prop<boolean>(false),
  isManagerOpen: prop<boolean>(false),
  managerSearchPage: prop<number>(1).withSetter(),
  managerSearchPageCount: prop<number>(1).withSetter(),
  managerSearchResults: prop<FileCollection[]>(() => []).withSetter(),
  managerSearchSort: prop<SortMenuProps["value"]>(
    () => getConfig().collection.managerSearchSort
  ).withSetter(),
  managerTagSearchValue: prop<TagOption[]>(() => []).withSetter(),
  managerTitleSearchValue: prop<string>("").withSetter(),
  selectedFileIds: prop<string[]>(() => []).withSetter(),
  selectedFiles: prop<File[]>(() => []).withSetter(),
}) {
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
    const index = this.activeFiles.length;
    this.activeFiles.push(new FileCollectionFile({ file: clone(file), id: file.id, index }));
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
    const fileIdIndexes = this.activeFiles.map((f) => ({ id: f.id, index: f.index }));
    const [from, to] = [fromFileId, toFileId].map((id) => fileIdIndexes.find((f) => f.id === id));
    if (!from || !to) return console.error(`Missing file for ${fromFileId} or ${toFileId}`);
    if (from.index === to.index) return console.debug("Indexes are the same, no move needed");

    this.setActiveFiles(
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
          this.setActiveFiles(
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
          excludedFileIds: this.activeFiles.map((f) => f.id),
          includeTagged: false,
          includeUntagged: false,
          isArchived: false,
          isSortDesc: this.editorSearchSort.isDesc,
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
  loadSelectedFiles = _async(function* (this: FileCollectionStore) {
    return yield* _await(
      handleErrors(async () => {
        const res = await trpc.listFiles.mutate({ ids: this.selectedFileIds });
        if (!res.success) throw new Error(res.error);
        this.setSelectedFiles(res.data.map((f) => new File(f)));
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

        if (this.activeCollectionId === updates.id) this.loadActiveCollection();
      })
    );
  });

  /* --------------------------------- DYNAMIC GETTERS -------------------------------- */
  getById(id: string) {
    return this.collections.find((c) => c.id === id);
  }

  getFileById(id: string) {
    return this.activeFiles.find((f) => f.id === id);
  }

  listByFileId(id: string) {
    return this.collections.filter((c) => c.fileIdIndexes.find((f) => f.fileId === id));
  }

  /* --------------------------------- GETTERS -------------------------------- */
  @computed
  get activeCollection() {
    return this.collections.find((c) => c.id === this.activeCollectionId);
  }

  @computed
  get activeTagIds() {
    return [...new Set(this.activeFiles.flatMap((f) => f.file?.tagIds ?? []))];
  }

  @computed
  get sortedActiveFiles() {
    return [...this.activeFiles].sort((a, b) => a.index - b.index);
  }
}
