/* -------------------------------------------------------------------------- */
/*                    THIS IS A GENERATED FILE. DO NOT EDIT.                  */
/* -------------------------------------------------------------------------- */

import { computed } from "mobx";
import {
  applySnapshot,
  getRootStore,
  getSnapshot,
  Model,
  model,
  modelAction,
  ModelCreationData,
  modelFlow,
  prop,
} from "mobx-keystone";
import * as models from "medior/_generated/models";
import * as Types from "medior/database/types";
import * as Stores from "medior/store";
import { asyncAction } from "medior/store/utils";
import { SortMenuProps } from "medior/components";
import { dayjs, getConfig, isDeepEqual, LogicalOp, makePerfLog, trpc } from "medior/utils";

/* --------------------------------------------------------------------------- */
/*                               SEARCH STORES
/* --------------------------------------------------------------------------- */
@model("medior/_FileSearch")
export class _FileSearch extends Model({
  dateCreatedEnd: prop<string>("").withSetter(),
  dateCreatedStart: prop<string>("").withSetter(),
  dateModifiedEnd: prop<string>("").withSetter(),
  dateModifiedStart: prop<string>("").withSetter(),
  excludedFileIds: prop<string[]>(() => []).withSetter(),
  hasChanges: prop<boolean>(false).withSetter(),
  hasDiffParams: prop<boolean>(false).withSetter(),
  isArchived: prop<boolean>(false).withSetter(),
  isLoading: prop<boolean>(false).withSetter(),
  maxHeight: prop<number>(null).withSetter(),
  maxWidth: prop<number>(null).withSetter(),
  minHeight: prop<number>(null).withSetter(),
  minWidth: prop<number>(null).withSetter(),
  numOfTags: prop<{ logOp: LogicalOp | ""; value: number }>(() => ({ logOp: "", value: 0 })),
  page: prop<number>(1).withSetter(),
  pageCount: prop<number>(1).withSetter(),
  pageSize: prop<number>(() => getConfig().file.searchFileCount).withSetter(),
  rating: prop<{ logOp: LogicalOp | ""; value: number }>(() => ({ logOp: "", value: 0 })),
  results: prop<Stores.File[]>(() => []).withSetter(),
  selectedImageTypes: prop<Types.SelectedImageTypes>(
    () =>
      Object.fromEntries(
        getConfig().file.imageTypes.map((ext) => [ext, true]),
      ) as Types.SelectedImageTypes,
  ),
  selectedVideoTypes: prop<Types.SelectedVideoTypes>(
    () =>
      Object.fromEntries(
        getConfig().file.videoTypes.map((ext) => [ext, true]),
      ) as Types.SelectedVideoTypes,
  ),
  sortValue: prop<SortMenuProps["value"]>(() => getConfig().file.searchSort).withSetter(),
  tags: prop<Stores.TagOption[]>(() => []).withSetter(),
}) {
  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  reset() {
    this.dateCreatedEnd = "";
    this.dateCreatedStart = "";
    this.dateModifiedEnd = "";
    this.dateModifiedStart = "";
    this.excludedFileIds = [];
    this.hasChanges = false;
    this.hasDiffParams = false;
    this.isArchived = false;
    this.isLoading = false;
    this.maxHeight = null;
    this.maxWidth = null;
    this.minHeight = null;
    this.minWidth = null;
    this.numOfTags = { logOp: "", value: 0 };
    this.page = 1;
    this.pageCount = 1;
    this.pageSize = getConfig().file.searchFileCount;
    this.rating = { logOp: "", value: 0 };
    this.results = [];
    this.selectedImageTypes = Object.fromEntries(
      getConfig().file.imageTypes.map((ext) => [ext, true]),
    ) as Types.SelectedImageTypes;
    this.selectedVideoTypes = Object.fromEntries(
      getConfig().file.videoTypes.map((ext) => [ext, true]),
    ) as Types.SelectedVideoTypes;
    this.sortValue = getConfig().file.searchSort;
    this.tags = [];
  }

  @modelAction
  setNumOfTagsOp(val: LogicalOp | "") {
    this.numOfTags.logOp = val;
  }

  @modelAction
  setNumOfTagsValue(val: number) {
    this.numOfTags.value = val;
  }

  @modelAction
  setRatingOp(val: LogicalOp | "") {
    this.rating.logOp = val;
  }

  @modelAction
  setRatingValue(val: number) {
    this.rating.value = val;
  }

  @modelAction
  setSelectedImageTypes(types: Partial<Types.SelectedImageTypes>) {
    this.selectedImageTypes = { ...this.selectedImageTypes, ...types };
  }

  @modelAction
  setSelectedVideoTypes(types: Partial<Types.SelectedVideoTypes>) {
    this.selectedVideoTypes = { ...this.selectedVideoTypes, ...types };
  }

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  getShiftSelected = asyncAction(
    async ({ id, selectedIds }: { id: string; selectedIds: string[] }) => {
      const clickedIndex =
        (this.page - 1) * this.pageSize + this.results.findIndex((r) => r.id === id);

      const res = await trpc.getShiftSelectedFiles.mutate({
        ...this.getFilterProps(),
        clickedId: id,
        clickedIndex,
        selectedIds,
      });
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
  );

  @modelFlow
  loadFiltered = asyncAction(async ({ ids, page }: { ids?: string[]; page?: number } = {}) => {
    const debug = false;
    const { perfLog, perfLogTotal } = makePerfLog("[FileSearch]");
    this.setIsLoading(true);

    const res = await trpc.listFilteredFiles.mutate({
      ...this.getFilterProps(),
      ids,
      page: page ?? this.page,
      pageSize: this.pageSize,
    });
    if (!res.success) throw new Error(res.error);

    const { items, pageCount } = res.data;
    if (debug) perfLog(`Loaded ${items.length} items`);

    this.setResults(items.map((item) => new Stores.File(item)));
    if (debug) perfLog("Overwrite and re-render");

    this.setPageCount(pageCount);
    if (page) this.setPage(page);
    if (debug) perfLog(`Set page to ${page ?? this.page} and pageCount to ${pageCount}`);

    if (debug) perfLogTotal(`Loaded ${items.length} items`);
    this.setIsLoading(false);
    this.setHasChanges(false);
    return items;
  });

  /* --------------------------------- GETTERS -------------------------------- */
  @computed
  get numOfFilters() {
    return (
      (!isDeepEqual(this.dateCreatedEnd, "") ? 1 : 0) +
      (!isDeepEqual(this.dateCreatedStart, "") ? 1 : 0) +
      (!isDeepEqual(this.dateModifiedEnd, "") ? 1 : 0) +
      (!isDeepEqual(this.dateModifiedStart, "") ? 1 : 0) +
      (!isDeepEqual(this.excludedFileIds, []) ? 1 : 0) +
      (!isDeepEqual(this.hasDiffParams, false) ? 1 : 0) +
      (!isDeepEqual(this.isArchived, false) ? 1 : 0) +
      (!isDeepEqual(this.maxHeight, null) ? 1 : 0) +
      (!isDeepEqual(this.maxWidth, null) ? 1 : 0) +
      (!isDeepEqual(this.minHeight, null) ? 1 : 0) +
      (!isDeepEqual(this.minWidth, null) ? 1 : 0) +
      (!isDeepEqual(this.numOfTags, { logOp: "", value: 0 }) ? 1 : 0) +
      (!isDeepEqual(this.rating, { logOp: "", value: 0 }) ? 1 : 0) +
      (!isDeepEqual(
        this.selectedImageTypes,
        Object.fromEntries(
          getConfig().file.imageTypes.map((ext) => [ext, true]),
        ) as Types.SelectedImageTypes,
      )
        ? 1
        : 0) +
      (!isDeepEqual(
        this.selectedVideoTypes,
        Object.fromEntries(
          getConfig().file.videoTypes.map((ext) => [ext, true]),
        ) as Types.SelectedVideoTypes,
      )
        ? 1
        : 0) +
      (!isDeepEqual(this.sortValue, getConfig().file.searchSort) ? 1 : 0) +
      (!isDeepEqual(this.tags, []) ? 1 : 0)
    );
  }

  /* --------------------------------- DYNAMIC GETTERS -------------------------------- */
  getFilterProps() {
    return {
      dateCreatedEnd: this.dateCreatedEnd,
      dateCreatedStart: this.dateCreatedStart,
      dateModifiedEnd: this.dateModifiedEnd,
      dateModifiedStart: this.dateModifiedStart,
      excludedFileIds: this.excludedFileIds,
      hasDiffParams: this.hasDiffParams,
      isArchived: this.isArchived,
      maxHeight: this.maxHeight,
      maxWidth: this.maxWidth,
      minHeight: this.minHeight,
      minWidth: this.minWidth,
      numOfTags: this.numOfTags,
      rating: this.rating,
      selectedImageTypes: this.selectedImageTypes,
      selectedVideoTypes: this.selectedVideoTypes,
      sortValue: this.sortValue,
      ...getRootStore<Stores.RootStore>(this)?.tag?.tagSearchOptsToIds(this.tags),
    };
  }
}

@model("medior/_FileCollectionSearch")
export class _FileCollectionSearch extends Model({
  dateCreatedEnd: prop<string>("").withSetter(),
  dateCreatedStart: prop<string>("").withSetter(),
  dateModifiedEnd: prop<string>("").withSetter(),
  dateModifiedStart: prop<string>("").withSetter(),
  fileCount: prop<{ logOp: LogicalOp | ""; value: number }>(() => ({ logOp: "", value: 0 })),
  hasChanges: prop<boolean>(false).withSetter(),
  isLoading: prop<boolean>(false).withSetter(),
  page: prop<number>(1).withSetter(),
  pageCount: prop<number>(1).withSetter(),
  pageSize: prop<number>(() => getConfig().collection.searchFileCount).withSetter(),
  rating: prop<{ logOp: LogicalOp | ""; value: number }>(() => ({ logOp: "", value: 0 })),
  results: prop<Stores.FileCollection[]>(() => []).withSetter(),
  sortValue: prop<SortMenuProps["value"]>(
    () => getConfig().collection.managerSearchSort,
  ).withSetter(),
  tags: prop<Stores.TagOption[]>(() => []).withSetter(),
  title: prop<string>("").withSetter(),
}) {
  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  reset() {
    this.dateCreatedEnd = "";
    this.dateCreatedStart = "";
    this.dateModifiedEnd = "";
    this.dateModifiedStart = "";
    this.fileCount = { logOp: "", value: 0 };
    this.hasChanges = false;
    this.isLoading = false;
    this.page = 1;
    this.pageCount = 1;
    this.pageSize = getConfig().collection.searchFileCount;
    this.rating = { logOp: "", value: 0 };
    this.results = [];
    this.sortValue = getConfig().collection.managerSearchSort;
    this.tags = [];
    this.title = "";
  }

  @modelAction
  setFileCountOp(val: LogicalOp | "") {
    this.fileCount.logOp = val;
  }

  @modelAction
  setFileCountValue(val: number) {
    this.fileCount.value = val;
  }

  @modelAction
  setRatingOp(val: LogicalOp | "") {
    this.rating.logOp = val;
  }

  @modelAction
  setRatingValue(val: number) {
    this.rating.value = val;
  }

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  getShiftSelected = asyncAction(
    async ({ id, selectedIds }: { id: string; selectedIds: string[] }) => {
      const clickedIndex =
        (this.page - 1) * this.pageSize + this.results.findIndex((r) => r.id === id);

      const res = await trpc.getShiftSelectedFileCollections.mutate({
        ...this.getFilterProps(),
        clickedId: id,
        clickedIndex,
        selectedIds,
      });
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
  );

  @modelFlow
  loadFiltered = asyncAction(async ({ ids, page }: { ids?: string[]; page?: number } = {}) => {
    const debug = false;
    const { perfLog, perfLogTotal } = makePerfLog("[FileCollectionSearch]");
    this.setIsLoading(true);

    const res = await trpc.listFilteredFileCollections.mutate({
      ...this.getFilterProps(),
      ids,
      page: page ?? this.page,
      pageSize: this.pageSize,
    });
    if (!res.success) throw new Error(res.error);

    const { items, pageCount } = res.data;
    if (debug) perfLog(`Loaded ${items.length} items`);

    this.setResults(items.map((item) => new Stores.FileCollection(item)));
    if (debug) perfLog("Overwrite and re-render");

    this.setPageCount(pageCount);
    if (page) this.setPage(page);
    if (debug) perfLog(`Set page to ${page ?? this.page} and pageCount to ${pageCount}`);

    if (debug) perfLogTotal(`Loaded ${items.length} items`);
    this.setIsLoading(false);
    this.setHasChanges(false);
    return items;
  });

  /* --------------------------------- GETTERS -------------------------------- */
  @computed
  get numOfFilters() {
    return (
      (!isDeepEqual(this.dateCreatedEnd, "") ? 1 : 0) +
      (!isDeepEqual(this.dateCreatedStart, "") ? 1 : 0) +
      (!isDeepEqual(this.dateModifiedEnd, "") ? 1 : 0) +
      (!isDeepEqual(this.dateModifiedStart, "") ? 1 : 0) +
      (!isDeepEqual(this.fileCount, { logOp: "", value: 0 }) ? 1 : 0) +
      (!isDeepEqual(this.rating, { logOp: "", value: 0 }) ? 1 : 0) +
      (!isDeepEqual(this.sortValue, getConfig().collection.managerSearchSort) ? 1 : 0) +
      (!isDeepEqual(this.tags, []) ? 1 : 0) +
      (!isDeepEqual(this.title, "") ? 1 : 0)
    );
  }

  /* --------------------------------- DYNAMIC GETTERS -------------------------------- */
  getFilterProps() {
    return {
      dateCreatedEnd: this.dateCreatedEnd,
      dateCreatedStart: this.dateCreatedStart,
      dateModifiedEnd: this.dateModifiedEnd,
      dateModifiedStart: this.dateModifiedStart,
      fileCount: this.fileCount,
      rating: this.rating,
      sortValue: this.sortValue,
      ...getRootStore<Stores.RootStore>(this)?.tag?.tagSearchOptsToIds(this.tags),
      title: this.title,
    };
  }
}

@model("medior/_TagSearch")
export class _TagSearch extends Model({
  alias: prop<string>("").withSetter(),
  count: prop<{ logOp: LogicalOp | ""; value: number }>(() => ({ logOp: "", value: 0 })),
  dateCreatedEnd: prop<string>("").withSetter(),
  dateCreatedStart: prop<string>("").withSetter(),
  dateModifiedEnd: prop<string>("").withSetter(),
  dateModifiedStart: prop<string>("").withSetter(),
  hasChanges: prop<boolean>(false).withSetter(),
  isLoading: prop<boolean>(false).withSetter(),
  label: prop<string>("").withSetter(),
  page: prop<number>(1).withSetter(),
  pageCount: prop<number>(1).withSetter(),
  pageSize: prop<number>(() => getConfig().tags.searchTagCount).withSetter(),
  regExMode: prop<"any" | "hasRegEx" | "hasNoRegEx">("any").withSetter(),
  results: prop<Stores.Tag[]>(() => []).withSetter(),
  sortValue: prop<SortMenuProps["value"]>(() => getConfig().tags.managerSearchSort).withSetter(),
  tags: prop<Stores.TagOption[]>(() => []).withSetter(),
}) {
  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  reset() {
    this.alias = "";
    this.count = { logOp: "", value: 0 };
    this.dateCreatedEnd = "";
    this.dateCreatedStart = "";
    this.dateModifiedEnd = "";
    this.dateModifiedStart = "";
    this.hasChanges = false;
    this.isLoading = false;
    this.label = "";
    this.page = 1;
    this.pageCount = 1;
    this.pageSize = getConfig().tags.searchTagCount;
    this.regExMode = "any";
    this.results = [];
    this.sortValue = getConfig().tags.managerSearchSort;
    this.tags = [];
  }

  @modelAction
  setCountOp(val: LogicalOp | "") {
    this.count.logOp = val;
  }

  @modelAction
  setCountValue(val: number) {
    this.count.value = val;
  }

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  getShiftSelected = asyncAction(
    async ({ id, selectedIds }: { id: string; selectedIds: string[] }) => {
      const clickedIndex =
        (this.page - 1) * this.pageSize + this.results.findIndex((r) => r.id === id);

      const res = await trpc.getShiftSelectedTags.mutate({
        ...this.getFilterProps(),
        clickedId: id,
        clickedIndex,
        selectedIds,
      });
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
  );

  @modelFlow
  loadFiltered = asyncAction(async ({ ids, page }: { ids?: string[]; page?: number } = {}) => {
    const debug = false;
    const { perfLog, perfLogTotal } = makePerfLog("[TagSearch]");
    this.setIsLoading(true);

    const res = await trpc.listFilteredTags.mutate({
      ...this.getFilterProps(),
      ids,
      page: page ?? this.page,
      pageSize: this.pageSize,
    });
    if (!res.success) throw new Error(res.error);

    const { items, pageCount } = res.data;
    if (debug) perfLog(`Loaded ${items.length} items`);

    this.setResults(items.map((item) => new Stores.Tag(item)));
    if (debug) perfLog("Overwrite and re-render");

    this.setPageCount(pageCount);
    if (page) this.setPage(page);
    if (debug) perfLog(`Set page to ${page ?? this.page} and pageCount to ${pageCount}`);

    if (debug) perfLogTotal(`Loaded ${items.length} items`);
    this.setIsLoading(false);
    this.setHasChanges(false);
    return items;
  });

  /* --------------------------------- GETTERS -------------------------------- */
  @computed
  get numOfFilters() {
    return (
      (!isDeepEqual(this.alias, "") ? 1 : 0) +
      (!isDeepEqual(this.count, { logOp: "", value: 0 }) ? 1 : 0) +
      (!isDeepEqual(this.dateCreatedEnd, "") ? 1 : 0) +
      (!isDeepEqual(this.dateCreatedStart, "") ? 1 : 0) +
      (!isDeepEqual(this.dateModifiedEnd, "") ? 1 : 0) +
      (!isDeepEqual(this.dateModifiedStart, "") ? 1 : 0) +
      (!isDeepEqual(this.label, "") ? 1 : 0) +
      (!isDeepEqual(this.regExMode, "any") ? 1 : 0) +
      (!isDeepEqual(this.sortValue, getConfig().tags.managerSearchSort) ? 1 : 0) +
      (!isDeepEqual(this.tags, []) ? 1 : 0)
    );
  }

  /* --------------------------------- DYNAMIC GETTERS -------------------------------- */
  getFilterProps() {
    return {
      alias: this.alias,
      count: this.count,
      dateCreatedEnd: this.dateCreatedEnd,
      dateCreatedStart: this.dateCreatedStart,
      dateModifiedEnd: this.dateModifiedEnd,
      dateModifiedStart: this.dateModifiedStart,
      label: this.label,
      regExMode: this.regExMode,
      sortValue: this.sortValue,
      ...getRootStore<Stores.RootStore>(this)?.tag?.tagSearchOptsToIds(this.tags),
    };
  }
}

/* --------------------------------------------------------------------------- */
/*                               SCHEMA STORES
/* --------------------------------------------------------------------------- */
/* --------------------------------------------------------------------------- */
/*                               DeletedFile
/* --------------------------------------------------------------------------- */
@model("medior/_DeletedFile")
export class _DeletedFile extends Model({
  dateCreated: prop<string>(() => dayjs().toISOString()),
  id: prop<string>(),
  hash: prop<string>(),
}) {
  @modelAction
  update(updates: Partial<ModelCreationData<this>>) {
    applySnapshot(this, { ...getSnapshot(this), ...updates });
  }
}

@model("aio/_DeletedFileStore")
export class _DeletedFileStore extends Model({
  isLoading: prop<boolean>(false).withSetter(),
}) {
  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  createDeletedFile = asyncAction(async (args: Types.CreateDeletedFileInput) => {
    this.setIsLoading(true);
    const res = await trpc.createDeletedFile.mutate({ args });
    this.setIsLoading(false);
    if (res.error) throw new Error(res.error);
    return res.data;
  });

  @modelFlow
  deleteDeletedFile = asyncAction(async (args: Types.DeleteDeletedFileInput) => {
    this.setIsLoading(true);
    const res = await trpc.deleteDeletedFile.mutate({ args });
    this.setIsLoading(false);
    if (res.error) throw new Error(res.error);
    return res.data;
  });

  @modelFlow
  updateDeletedFile = asyncAction(async (args: Types.UpdateDeletedFileInput) => {
    this.setIsLoading(true);
    const res = await trpc.updateDeletedFile.mutate({ args });
    this.setIsLoading(false);
    if (res.error) throw new Error(res.error);
    return res.data;
  });
}

/* --------------------------------------------------------------------------- */
/*                               FileCollection
/* --------------------------------------------------------------------------- */
@model("medior/_FileCollection")
export class _FileCollection extends Model({
  dateCreated: prop<string>(() => dayjs().toISOString()),
  id: prop<string>(),
  dateModified: prop<string>(null),
  fileCount: prop<number>(0),
  fileIdIndexes: prop<{ fileId: string; index: number }[]>(),
  rating: prop<number>(0),
  tagIds: prop<string[]>(() => []),
  tagIdsWithAncestors: prop<string[]>(() => []),
  thumbPaths: prop<string[]>(() => []),
  title: prop<string>(),
}) {
  @modelAction
  update(updates: Partial<ModelCreationData<this>>) {
    applySnapshot(this, { ...getSnapshot(this), ...updates });
  }
}

@model("aio/_FileCollectionStore")
export class _FileCollectionStore extends Model({
  isLoading: prop<boolean>(false).withSetter(),
}) {
  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  createFileCollection = asyncAction(async (args: Types.CreateFileCollectionInput) => {
    this.setIsLoading(true);
    const res = await trpc.createFileCollection.mutate({ args });
    this.setIsLoading(false);
    if (res.error) throw new Error(res.error);
    return res.data;
  });

  @modelFlow
  deleteFileCollection = asyncAction(async (args: Types.DeleteFileCollectionInput) => {
    this.setIsLoading(true);
    const res = await trpc.deleteFileCollection.mutate({ args });
    this.setIsLoading(false);
    if (res.error) throw new Error(res.error);
    return res.data;
  });

  @modelFlow
  updateFileCollection = asyncAction(async (args: Types.UpdateFileCollectionInput) => {
    this.setIsLoading(true);
    const res = await trpc.updateFileCollection.mutate({ args });
    this.setIsLoading(false);
    if (res.error) throw new Error(res.error);
    return res.data;
  });
}

/* --------------------------------------------------------------------------- */
/*                               FileImportBatch
/* --------------------------------------------------------------------------- */
@model("medior/_FileImportBatch")
export class _FileImportBatch extends Model({
  dateCreated: prop<string>(() => dayjs().toISOString()),
  id: prop<string>(),
  collectionId: prop<string>(null),
  collectionTitle: prop<string>(null),
  completedAt: prop<string>(),
  deleteOnImport: prop<boolean>(),
  ignorePrevDeleted: prop<boolean>(),
  imports: prop<Stores.FileImport[]>(() => []),
  rootFolderPath: prop<string>(),
  startedAt: prop<string>(null),
  tagIds: prop<string[]>(),
}) {
  @modelAction
  update(updates: Partial<ModelCreationData<this>>) {
    applySnapshot(this, { ...getSnapshot(this), ...updates });
  }
}

@model("medior/_FileImport")
export class _FileImport extends Model({
  dateCreated: prop<string>(),
  diffusionParams: prop<string>(null),
  errorMsg: prop<string>(null),
  extension: prop<string>(),
  fileId: prop<string>(null),
  name: prop<string>(),
  path: prop<string>(),
  size: prop<number>(),
  status: prop<string | "COMPLETE" | "DELETED" | "DUPLICATE" | "ERROR" | "PENDING">(),
  tagIds: prop<string[]>(null),
  thumbPaths: prop<string[]>(null),
}) {
  @modelAction
  update(updates: Partial<ModelCreationData<this>>) {
    applySnapshot(this, { ...getSnapshot(this), ...updates });
  }
}

@model("aio/_FileImportBatchStore")
export class _FileImportBatchStore extends Model({
  isLoading: prop<boolean>(false).withSetter(),
}) {
  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  createFileImportBatch = asyncAction(async (args: Types.CreateFileImportBatchInput) => {
    this.setIsLoading(true);
    const res = await trpc.createFileImportBatch.mutate({ args });
    this.setIsLoading(false);
    if (res.error) throw new Error(res.error);
    return res.data;
  });

  @modelFlow
  deleteFileImportBatch = asyncAction(async (args: Types.DeleteFileImportBatchInput) => {
    this.setIsLoading(true);
    const res = await trpc.deleteFileImportBatch.mutate({ args });
    this.setIsLoading(false);
    if (res.error) throw new Error(res.error);
    return res.data;
  });

  @modelFlow
  updateFileImportBatch = asyncAction(async (args: Types.UpdateFileImportBatchInput) => {
    this.setIsLoading(true);
    const res = await trpc.updateFileImportBatch.mutate({ args });
    this.setIsLoading(false);
    if (res.error) throw new Error(res.error);
    return res.data;
  });
}

/* --------------------------------------------------------------------------- */
/*                               File
/* --------------------------------------------------------------------------- */
@model("medior/_File")
export class _File extends Model({
  dateCreated: prop<string>(() => dayjs().toISOString()),
  id: prop<string>(),
  dateModified: prop<string>(),
  diffusionParams: prop<string>(null),
  duration: prop<number>(null),
  ext: prop<string>(),
  frameRate: prop<number>(),
  hash: prop<string>(),
  height: prop<number>(),
  isArchived: prop<boolean>(),
  originalHash: prop<string>(null),
  originalName: prop<string>(null),
  originalPath: prop<string>(),
  path: prop<string>(),
  rating: prop<number>(),
  size: prop<number>(),
  tagIds: prop<string[]>(() => []),
  tagIdsWithAncestors: prop<string[]>(() => []),
  thumbPaths: prop<string[]>(() => []),
  width: prop<number>(),
}) {
  @modelAction
  update(updates: Partial<ModelCreationData<this>>) {
    applySnapshot(this, { ...getSnapshot(this), ...updates });
  }
}

@model("aio/_FileStore")
export class _FileStore extends Model({
  isLoading: prop<boolean>(false).withSetter(),
}) {
  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  createFile = asyncAction(async (args: Types.CreateFileInput) => {
    this.setIsLoading(true);
    const res = await trpc.createFile.mutate({ args });
    this.setIsLoading(false);
    if (res.error) throw new Error(res.error);
    return res.data;
  });

  @modelFlow
  deleteFile = asyncAction(async (args: Types.DeleteFileInput) => {
    this.setIsLoading(true);
    const res = await trpc.deleteFile.mutate({ args });
    this.setIsLoading(false);
    if (res.error) throw new Error(res.error);
    return res.data;
  });

  @modelFlow
  updateFile = asyncAction(async (args: Types._UpdateFileInput) => {
    this.setIsLoading(true);
    const res = await trpc._updateFile.mutate({ args });
    this.setIsLoading(false);
    if (res.error) throw new Error(res.error);
    return res.data;
  });
}

/* --------------------------------------------------------------------------- */
/*                               RegExMap
/* --------------------------------------------------------------------------- */
@model("medior/_RegExMap")
export class _RegExMap extends Model({
  id: prop<string>(null),
  regEx: prop<string>(),
  testString: prop<string>(null),
  types: prop<Array<"diffusionParams" | "fileName" | "folderName">>(),
}) {
  @modelAction
  update(updates: Partial<ModelCreationData<this>>) {
    applySnapshot(this, { ...getSnapshot(this), ...updates });
  }
}

@model("aio/_RegExMapStore")
export class _RegExMapStore extends Model({
  isLoading: prop<boolean>(false).withSetter(),
}) {
  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  createRegExMap = asyncAction(async (args: Types.CreateRegExMapInput) => {
    this.setIsLoading(true);
    const res = await trpc.createRegExMap.mutate({ args });
    this.setIsLoading(false);
    if (res.error) throw new Error(res.error);
    return res.data;
  });

  @modelFlow
  deleteRegExMap = asyncAction(async (args: Types.DeleteRegExMapInput) => {
    this.setIsLoading(true);
    const res = await trpc.deleteRegExMap.mutate({ args });
    this.setIsLoading(false);
    if (res.error) throw new Error(res.error);
    return res.data;
  });

  @modelFlow
  updateRegExMap = asyncAction(async (args: Types.UpdateRegExMapInput) => {
    this.setIsLoading(true);
    const res = await trpc.updateRegExMap.mutate({ args });
    this.setIsLoading(false);
    if (res.error) throw new Error(res.error);
    return res.data;
  });
}

/* --------------------------------------------------------------------------- */
/*                               Tag
/* --------------------------------------------------------------------------- */
@model("medior/_Tag")
export class _Tag extends Model({
  dateCreated: prop<string>(() => dayjs().toISOString()),
  id: prop<string>(),
  aliases: prop<string[]>(() => []),
  ancestorIds: prop<string[]>(() => []),
  childIds: prop<string[]>(() => []),
  count: prop<number>(),
  dateModified: prop<string>(),
  descendantIds: prop<string[]>(() => []),
  label: prop<string>(),
  parentIds: prop<string[]>(() => []),
  regExMap: prop<models.RegExMapSchema>(null),
  thumbPaths: prop<string[]>(),
}) {
  @modelAction
  update(updates: Partial<ModelCreationData<this>>) {
    applySnapshot(this, { ...getSnapshot(this), ...updates });
  }
}

@model("aio/_TagStore")
export class _TagStore extends Model({
  isLoading: prop<boolean>(false).withSetter(),
}) {
  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  createTag = asyncAction(async (args: Types._CreateTagInput) => {
    this.setIsLoading(true);
    const res = await trpc._createTag.mutate({ args });
    this.setIsLoading(false);
    if (res.error) throw new Error(res.error);
    return res.data;
  });

  @modelFlow
  deleteTag = asyncAction(async (args: Types._DeleteTagInput) => {
    this.setIsLoading(true);
    const res = await trpc._deleteTag.mutate({ args });
    this.setIsLoading(false);
    if (res.error) throw new Error(res.error);
    return res.data;
  });

  @modelFlow
  updateTag = asyncAction(async (args: Types.UpdateTagInput) => {
    this.setIsLoading(true);
    const res = await trpc.updateTag.mutate({ args });
    this.setIsLoading(false);
    if (res.error) throw new Error(res.error);
    return res.data;
  });
}
