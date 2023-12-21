import { computed } from "mobx";
import {
  _async,
  _await,
  clone,
  model,
  Model,
  modelAction,
  ModelCreationData,
  modelFlow,
  prop,
} from "mobx-keystone";
import {
  File,
  mongoFileToMobX,
  SelectedImageTypes,
  SelectedVideoTypes,
  sortFn,
  TagOption,
} from "store";
import { CreateCollectionInput, LoadCollectionsInput, LoadSearchResultsInput } from "database";
import { FileCollection, FileCollectionFile } from ".";
import { CONSTANTS, handleErrors, IMAGE_TYPES, trpc, VIDEO_TYPES } from "utils";
import { toast } from "react-toastify";
import { arrayMove } from "@alissavrk/dnd-kit-sortable";

@model("mediaViewer/FileCollectionStore")
export class FileCollectionStore extends Model({
  activeCollectionId: prop<string>(null).withSetter(),
  activeFiles: prop<FileCollectionFile[]>(() => []).withSetter(),
  collections: prop<FileCollection[]>(() => []).withSetter(),
  hasUnsavedChanges: prop<boolean>(false).withSetter(),
  isCollectionEditorOpen: prop<boolean>(false),
  isCollectionManagerOpen: prop<boolean>(false),
  searchPage: prop<number>(1).withSetter(),
  searchPageCount: prop<number>(1).withSetter(),
  searchIsSortDesc: prop<boolean>(true).withSetter(),
  searchResults: prop<File[]>(() => []).withSetter(),
  searchSortKey: prop<string>("dateModified").withSetter(),
  searchValue: prop<TagOption[]>(() => []).withSetter(),
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
  clearSearch() {
    this.searchPage = 1;
    this.searchPageCount = 1;
    this.searchIsSortDesc = true;
    this.searchResults = [];
    this.searchSortKey = "dateModified";
    this.searchValue = [];
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
  }

  @modelAction
  overwrite(collections: ModelCreationData<FileCollection>[]) {
    this.collections = collections.map((f) => new FileCollection(f));
  }

  @modelAction
  setIsCollectionEditorOpen(isOpen: boolean) {
    this.isCollectionEditorOpen = isOpen;
  }

  @modelAction
  setIsCollectionManagerOpen(isOpen: boolean) {
    this.isCollectionManagerOpen = isOpen;
    if (isOpen) this.isCollectionEditorOpen = false;
  }

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  createCollection = _async(function* (
    this: FileCollectionStore,
    { fileIdIndexes, title, withSub = true }: CreateCollectionInput
  ) {
    return yield* _await(
      handleErrors(async () => {
        const res = await trpc.createCollection.mutate({ fileIdIndexes, title });
        if (!res.success) throw new Error(res.error);

        this._addCollection(res.data);
        toast.success(`Collection "${title}" created!`);

        if (withSub) trpc.onCollectionCreated.mutate({ collection: res.data });
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
                    file: new File(mongoFileToMobX(f)),
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
  loadCollections = _async(function* (
    this: FileCollectionStore,
    { collectionIds, withOverwrite = true }: LoadCollectionsInput = {}
  ) {
    return yield* _await(
      handleErrors(async () => {
        const collectionsRes = await trpc.listCollections.mutate({ ids: collectionIds });
        if (!collectionsRes.success) throw new Error(collectionsRes.error);
        if (withOverwrite) this.overwrite(collectionsRes.data);
        return collectionsRes.data;
      })
    );
  });

  @modelFlow
  loadSearchResults = _async(function* (
    this: FileCollectionStore,
    { page, rootStore }: LoadSearchResultsInput = { rootStore: null }
  ) {
    return yield* _await(
      handleErrors(async () => {
        const { tagStore } = rootStore;

        const { excludedAnyTagIds, includedAllTagIds, includedAnyTagIds } =
          tagStore.tagSearchOptsToIds(this.searchValue);

        const filteredRes = await trpc.listFilteredFileIds.mutate({
          excludedAnyTagIds,
          includedAllTagIds,
          includedAnyTagIds,
          includeTagged: false,
          includeUntagged: false,
          isArchived: false,
          isSortDesc: this.searchIsSortDesc,
          selectedImageTypes: Object.fromEntries(
            IMAGE_TYPES.map((ext) => [ext, true])
          ) as SelectedImageTypes,
          selectedVideoTypes: Object.fromEntries(
            VIDEO_TYPES.map((ext) => [ext, true])
          ) as SelectedVideoTypes,
          sortKey: this.searchSortKey,
        });
        if (!filteredRes.success) throw new Error(filteredRes.error);

        const displayedIds = filteredRes.data.slice(
          ((page ?? this.searchPage) - 1) * CONSTANTS.COLLECTION_SEARCH_FILE_COUNT,
          (page ?? this.searchPage) * CONSTANTS.COLLECTION_SEARCH_FILE_COUNT
        );

        const displayedRes = await trpc.listFiles.mutate({ ids: displayedIds });
        if (!displayedRes.success) throw new Error(displayedRes.error);
        const displayed = displayedRes.data.sort((a, b) =>
          sortFn({ a, b, isSortDesc: this.searchIsSortDesc, sortKey: this.searchSortKey })
        );

        this.setSearchResults(displayed.map((f) => new File(mongoFileToMobX(f))));
        this.setSearchPageCount(
          Math.ceil(filteredRes.data.length / CONSTANTS.COLLECTION_SEARCH_FILE_COUNT)
        );
        if (page) this.setSearchPage(page);

        return displayed;
      })
    );
  });

  @modelFlow
  loadSelectedFiles = _async(function* (this: FileCollectionStore) {
    return yield* _await(
      handleErrors(async () => {
        const res = await trpc.listFiles.mutate({ ids: this.selectedFileIds });
        if (!res.success) throw new Error(res.error);
        this.setSelectedFiles(res.data.map((f) => new File(mongoFileToMobX(f))));
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
