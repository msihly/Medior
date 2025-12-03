/* --------------------------------------------------------------------------- */
/*                               THIS IS A GENERATED FILE. DO NOT EDIT.
/* --------------------------------------------------------------------------- */
import autoBind from "auto-bind";
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
import * as Types from "medior/server/database/types";
import { SortMenuProps } from "medior/components";
import * as Stores from "medior/store";
import { asyncAction } from "medior/store/utils";
import { getConfig, toast } from "medior/utils/client";
import { dayjs, isDeepEqual, LogicalOp } from "medior/utils/common";
import { makePerfLog, trpc } from "medior/utils/server";

/* --------------------------------------------------------------------------- */
/*                               SEARCH STORES
/* --------------------------------------------------------------------------- */

@model("medior/_FileCollectionSearch")
export class _FileCollectionSearch extends Model({
  dateCreatedEnd: prop<string>("").withSetter(),
  dateCreatedStart: prop<string>("").withSetter(),
  dateModifiedEnd: prop<string>("").withSetter(),
  dateModifiedStart: prop<string>("").withSetter(),
  fileCount: prop<{ logOp: LogicalOp | ""; value: number }>(() => ({ logOp: "", value: 0 })),
  forcePages: prop<boolean>(false).withSetter(),
  hasChanges: prop<boolean>(false).withSetter(),
  ids: prop<string[]>(() => []).withSetter(),
  isLoading: prop<boolean>(false).withSetter(),
  isPageCountLoading: prop<boolean>(false).withSetter(),
  page: prop<number>(1).withSetter(),
  pageCount: prop<number>(1).withSetter(),
  pageSize: prop<number>(() => getConfig().collection.manager.search.pageSize).withSetter(),
  rating: prop<{ logOp: LogicalOp | ""; value: number }>(() => ({ logOp: "", value: 0 })),
  results: prop<Stores.FileCollection[]>(() => []).withSetter(),
  selectedIds: prop<string[]>(() => []).withSetter(),
  sortValue: prop<SortMenuProps["value"]>(
    () => getConfig().collection.manager.search.sort,
  ).withSetter(),
  tags: prop<Stores.TagOption[]>(() => []).withSetter(),
  title: prop<string>("").withSetter(),
}) {
  onInit() {
    autoBind(this);
  }

  /* STANDARD ACTIONS */
  @modelAction
  _addResult(result: ModelCreationData<Stores.FileCollection>) {
    this.results.push(new Stores.FileCollection(result));
  }

  @modelAction
  _deleteResults(ids: string[]) {
    this.results = this.results.filter((d) => !ids.includes(d.id));
  }

  @modelAction
  reset() {
    this.dateCreatedEnd = "";
    this.dateCreatedStart = "";
    this.dateModifiedEnd = "";
    this.dateModifiedStart = "";
    this.fileCount = { logOp: "", value: 0 };
    this.forcePages = false;
    this.hasChanges = false;
    this.ids = [];
    this.isLoading = false;
    this.isPageCountLoading = false;
    this.page = 1;
    this.pageCount = 1;
    this.pageSize = getConfig().collection.manager.search.pageSize;
    this.rating = { logOp: "", value: 0 };
    this.results = [];
    this.selectedIds = [];
    this.sortValue = getConfig().collection.manager.search.sort;
    this.tags = [];
    this.title = "";
  }

  @modelAction
  toggleSelected(selected: { id: string; isSelected?: boolean }[], withToast = false) {
    if (!selected?.length) return;

    const [added, removed] = selected.reduce(
      (acc, cur) => (acc[cur.isSelected ? 0 : 1].push(cur.id), acc),
      [[], []],
    );

    const removedSet = new Set(removed);
    this.selectedIds = [...new Set(this.selectedIds.concat(added))].filter(
      (id) => !removedSet.has(id),
    );

    if (withToast) {
      const addedCount = added.length;
      const removedCount = removed.length;
      if (addedCount && removedCount)
        toast.success(`Selected ${addedCount} items and deselected ${removedCount} items`);
      else if (addedCount) toast.success(`Selected ${addedCount} items`);
      else if (removedCount) toast.success(`Deselected ${removedCount} items`);
    }
  }

  @modelAction
  setFileCountOp(val: LogicalOp | "") {
    this.fileCount.logOp = val;
    if (val === "") this.fileCount.value = 0;
  }

  @modelAction
  setFileCountValue(val: number) {
    this.fileCount.value = val;
  }

  @modelAction
  setRatingOp(val: LogicalOp | "") {
    this.rating.logOp = val;
    if (val === "") this.rating.value = 0;
  }

  @modelAction
  setRatingValue(val: number) {
    this.rating.value = val;
  }

  /* ASYNC ACTIONS */
  @modelFlow
  getShiftSelected = asyncAction(
    async ({ id, selectedIds }: { id: string; selectedIds: string[] }) => {
      const clickedIndex =
        (this.page - 1) * this.pageSize + this.results.findIndex((r) => r.id === id);

      this.setIsLoading(true);
      const res = await trpc.getShiftSelectedFileCollection.mutate({
        ...this.getFilterProps(),
        clickedId: id,
        clickedIndex,
        selectedIds,
      });
      this.setIsLoading(false);

      if (!res.success) throw new Error(res.error);
      return res.data;
    },
  );

  @modelFlow
  handleSelect = asyncAction(
    async ({ hasCtrl, hasShift, id }: { hasCtrl: boolean; hasShift: boolean; id: string }) => {
      if (hasShift) {
        const res = await this.getShiftSelected({ id, selectedIds: this.selectedIds });
        if (!res?.success) throw new Error(res.error);
        this.toggleSelected([
          ...res.data.idsToDeselect.map((i) => ({ id: i, isSelected: false })),
          ...res.data.idsToSelect.map((i) => ({ id: i, isSelected: true })),
        ]);
      } else if (hasCtrl) {
        this.toggleSelected([{ id, isSelected: !this.getIsSelected(id) }]);
      } else {
        this.toggleSelected([
          ...this.selectedIds.map((id) => ({ id, isSelected: false })),
          { id, isSelected: true },
        ]);
      }
    },
  );

  @modelFlow
  loadFiltered = asyncAction(async ({ page }: { page?: number } = {}) => {
    const debug = false;
    const { perfLog } = makePerfLog("[FileCollectionSearch]");
    this.setIsLoading(true);
    this.setIsPageCountLoading(true);

    const itemsRes = await trpc.listFilteredFileCollection.mutate({
      ...this.getFilterProps(),
      forcePages: this.forcePages,
      page: page ?? this.page,
      pageSize: this.pageSize,
    });
    if (!itemsRes.success) throw new Error(itemsRes.error);

    let items = itemsRes.data;
    if (debug) perfLog(`Loaded ${items.length} items`);

    const tagIds = [...new Set(items.flatMap((item) => item.tagIds))];
    const tags = (await trpc.listTag.mutate({ args: { filter: { id: tagIds } } })).data.items;
    items = items.map((item) => ({
      ...item,
      tags: tags.filter((t) => item.tagIds.includes(t.id)),
    }));

    const results = items;

    this.setResults(results.map((result) => new Stores.FileCollection(result)));
    if (debug) perfLog("Overwrite and re-render");

    if (page) this.setPage(page);
    if (debug && page) perfLog(`Set page to ${page ?? this.page}`);
    this.setIsLoading(false);
    this.setHasChanges(false);

    const countRes = await trpc.getFilteredFileCollectionCount.mutate({
      ...this.getFilterProps(),
      pageSize: this.pageSize,
    });
    if (!countRes.success) throw new Error(countRes.error);
    const pageCount = countRes.data.pageCount;
    this.setPageCount(pageCount);
    this.setIsPageCountLoading(false);
    if (debug) perfLog(`Set pageCount to ${pageCount}`);

    return results;
  });

  /* GETTERS */
  @computed
  get numOfFilters() {
    return (
      (!isDeepEqual(this.dateCreatedEnd, "") ? 1 : 0) +
      (!isDeepEqual(this.dateCreatedStart, "") ? 1 : 0) +
      (!isDeepEqual(this.dateModifiedEnd, "") ? 1 : 0) +
      (!isDeepEqual(this.dateModifiedStart, "") ? 1 : 0) +
      (!isDeepEqual(this.fileCount, { logOp: "", value: 0 }) ? 1 : 0) +
      (!isDeepEqual(this.ids, []) ? 1 : 0) +
      (!isDeepEqual(this.rating, { logOp: "", value: 0 }) ? 1 : 0) +
      (!isDeepEqual(this.sortValue, getConfig().collection.manager.search.sort) ? 1 : 0) +
      (!isDeepEqual(this.tags, []) ? 1 : 0) +
      (!isDeepEqual(this.title, "") ? 1 : 0)
    );
  }

  /* DYNAMIC GETTERS */
  getFilterProps() {
    return {
      dateCreatedEnd: this.dateCreatedEnd,
      dateCreatedStart: this.dateCreatedStart,
      dateModifiedEnd: this.dateModifiedEnd,
      dateModifiedStart: this.dateModifiedStart,
      fileCount: this.fileCount,
      ids: this.ids,
      rating: this.rating,
      sortValue: this.sortValue,
      ...getRootStore<Stores.RootStore>(this)?.tag?.tagSearchOptsToIds(this.tags),
      title: this.title,
    };
  }

  getIsSelected(id: string) {
    return !!this.selectedIds.find((s) => s === id);
  }

  getResult(id: string) {
    return this.results.find((r) => r.id === id);
  }
}
@model("medior/_FileImportBatchSearch")
export class _FileImportBatchSearch extends Model({
  collectionTitle: prop<string>("").withSetter(),
  completedAtEnd: prop<string>("").withSetter(),
  completedAtStart: prop<string>("").withSetter(),
  dateCreatedEnd: prop<string>("").withSetter(),
  dateCreatedStart: prop<string>("").withSetter(),
  fileCount: prop<{ logOp: LogicalOp | ""; value: number }>(() => ({ logOp: "", value: 0 })),
  forcePages: prop<boolean>(false).withSetter(),
  hasChanges: prop<boolean>(false).withSetter(),
  ids: prop<string[]>(() => []).withSetter(),
  isCompleted: prop<boolean>(false).withSetter(),
  isLoading: prop<boolean>(false).withSetter(),
  isPageCountLoading: prop<boolean>(false).withSetter(),
  page: prop<number>(1).withSetter(),
  pageCount: prop<number>(1).withSetter(),
  pageSize: prop<number>(() => getConfig().imports.manager.search.pageSize).withSetter(),
  results: prop<Stores.FileImportBatch[]>(() => []).withSetter(),
  rootFolderPath: prop<string>("").withSetter(),
  selectedIds: prop<string[]>(() => []).withSetter(),
  sortValue: prop<SortMenuProps["value"]>(
    () => getConfig().imports.manager.search.sort,
  ).withSetter(),
  startedAtEnd: prop<string>("").withSetter(),
  startedAtStart: prop<string>("").withSetter(),
  tags: prop<Stores.TagOption[]>(() => []).withSetter(),
}) {
  onInit() {
    autoBind(this);
  }

  /* STANDARD ACTIONS */
  @modelAction
  _addResult(result: ModelCreationData<Stores.FileImportBatch>) {
    this.results.push(new Stores.FileImportBatch(result));
  }

  @modelAction
  _deleteResults(ids: string[]) {
    this.results = this.results.filter((d) => !ids.includes(d.id));
  }

  @modelAction
  reset() {
    this.collectionTitle = "";
    this.completedAtEnd = "";
    this.completedAtStart = "";
    this.dateCreatedEnd = "";
    this.dateCreatedStart = "";
    this.fileCount = { logOp: "", value: 0 };
    this.forcePages = false;
    this.hasChanges = false;
    this.ids = [];
    this.isCompleted = false;
    this.isLoading = false;
    this.isPageCountLoading = false;
    this.page = 1;
    this.pageCount = 1;
    this.pageSize = getConfig().imports.manager.search.pageSize;
    this.results = [];
    this.rootFolderPath = "";
    this.selectedIds = [];
    this.sortValue = getConfig().imports.manager.search.sort;
    this.startedAtEnd = "";
    this.startedAtStart = "";
    this.tags = [];
  }

  @modelAction
  toggleSelected(selected: { id: string; isSelected?: boolean }[], withToast = false) {
    if (!selected?.length) return;

    const [added, removed] = selected.reduce(
      (acc, cur) => (acc[cur.isSelected ? 0 : 1].push(cur.id), acc),
      [[], []],
    );

    const removedSet = new Set(removed);
    this.selectedIds = [...new Set(this.selectedIds.concat(added))].filter(
      (id) => !removedSet.has(id),
    );

    if (withToast) {
      const addedCount = added.length;
      const removedCount = removed.length;
      if (addedCount && removedCount)
        toast.success(`Selected ${addedCount} items and deselected ${removedCount} items`);
      else if (addedCount) toast.success(`Selected ${addedCount} items`);
      else if (removedCount) toast.success(`Deselected ${removedCount} items`);
    }
  }

  @modelAction
  setFileCountOp(val: LogicalOp | "") {
    this.fileCount.logOp = val;
    if (val === "") this.fileCount.value = 0;
  }

  @modelAction
  setFileCountValue(val: number) {
    this.fileCount.value = val;
  }

  /* ASYNC ACTIONS */
  @modelFlow
  getShiftSelected = asyncAction(
    async ({ id, selectedIds }: { id: string; selectedIds: string[] }) => {
      const clickedIndex =
        (this.page - 1) * this.pageSize + this.results.findIndex((r) => r.id === id);

      this.setIsLoading(true);
      const res = await trpc.getShiftSelectedFileImportBatch.mutate({
        ...this.getFilterProps(),
        clickedId: id,
        clickedIndex,
        selectedIds,
      });
      this.setIsLoading(false);

      if (!res.success) throw new Error(res.error);
      return res.data;
    },
  );

  @modelFlow
  handleSelect = asyncAction(
    async ({ hasCtrl, hasShift, id }: { hasCtrl: boolean; hasShift: boolean; id: string }) => {
      if (hasShift) {
        const res = await this.getShiftSelected({ id, selectedIds: this.selectedIds });
        if (!res?.success) throw new Error(res.error);
        this.toggleSelected([
          ...res.data.idsToDeselect.map((i) => ({ id: i, isSelected: false })),
          ...res.data.idsToSelect.map((i) => ({ id: i, isSelected: true })),
        ]);
      } else if (hasCtrl) {
        this.toggleSelected([{ id, isSelected: !this.getIsSelected(id) }]);
      } else {
        this.toggleSelected([
          ...this.selectedIds.map((id) => ({ id, isSelected: false })),
          { id, isSelected: true },
        ]);
      }
    },
  );

  @modelFlow
  loadFiltered = asyncAction(async ({ page }: { page?: number } = {}) => {
    const debug = false;
    const { perfLog } = makePerfLog("[FileImportBatchSearch]");
    this.setIsLoading(true);
    this.setIsPageCountLoading(true);

    const itemsRes = await trpc.listFilteredFileImportBatch.mutate({
      ...this.getFilterProps(),
      forcePages: this.forcePages,
      page: page ?? this.page,
      pageSize: this.pageSize,
    });
    if (!itemsRes.success) throw new Error(itemsRes.error);

    let items = itemsRes.data;
    if (debug) perfLog(`Loaded ${items.length} items`);

    const tagIds = [...new Set(items.flatMap((item) => item.tagIds))];
    const tags = (await trpc.listTag.mutate({ args: { filter: { id: tagIds } } })).data.items;
    items = items.map((item) => ({
      ...item,
      tags: tags.filter((t) => item.tagIds.includes(t.id)),
    }));

    const results = items.map((batch) => ({
      ...batch,
      imports: batch.imports.map((imp) => new Stores.FileImport(imp)),
    }));

    this.setResults(results.map((result) => new Stores.FileImportBatch(result)));
    if (debug) perfLog("Overwrite and re-render");

    if (page) this.setPage(page);
    if (debug && page) perfLog(`Set page to ${page ?? this.page}`);
    this.setIsLoading(false);
    this.setHasChanges(false);

    const countRes = await trpc.getFilteredFileImportBatchCount.mutate({
      ...this.getFilterProps(),
      pageSize: this.pageSize,
    });
    if (!countRes.success) throw new Error(countRes.error);
    const pageCount = countRes.data.pageCount;
    this.setPageCount(pageCount);
    this.setIsPageCountLoading(false);
    if (debug) perfLog(`Set pageCount to ${pageCount}`);

    return results;
  });

  /* GETTERS */
  @computed
  get numOfFilters() {
    return (
      (!isDeepEqual(this.collectionTitle, "") ? 1 : 0) +
      (!isDeepEqual(this.completedAtEnd, "") ? 1 : 0) +
      (!isDeepEqual(this.completedAtStart, "") ? 1 : 0) +
      (!isDeepEqual(this.dateCreatedEnd, "") ? 1 : 0) +
      (!isDeepEqual(this.dateCreatedStart, "") ? 1 : 0) +
      (!isDeepEqual(this.fileCount, { logOp: "", value: 0 }) ? 1 : 0) +
      (!isDeepEqual(this.ids, []) ? 1 : 0) +
      (!isDeepEqual(this.isCompleted, false) ? 1 : 0) +
      (!isDeepEqual(this.rootFolderPath, "") ? 1 : 0) +
      (!isDeepEqual(this.sortValue, getConfig().imports.manager.search.sort) ? 1 : 0) +
      (!isDeepEqual(this.startedAtEnd, "") ? 1 : 0) +
      (!isDeepEqual(this.startedAtStart, "") ? 1 : 0) +
      (!isDeepEqual(this.tags, []) ? 1 : 0)
    );
  }

  /* DYNAMIC GETTERS */
  getFilterProps() {
    return {
      collectionTitle: this.collectionTitle,
      completedAtEnd: this.completedAtEnd,
      completedAtStart: this.completedAtStart,
      dateCreatedEnd: this.dateCreatedEnd,
      dateCreatedStart: this.dateCreatedStart,
      fileCount: this.fileCount,
      ids: this.ids,
      isCompleted: this.isCompleted,
      rootFolderPath: this.rootFolderPath,
      sortValue: this.sortValue,
      startedAtEnd: this.startedAtEnd,
      startedAtStart: this.startedAtStart,
      ...getRootStore<Stores.RootStore>(this)?.tag?.tagSearchOptsToIds(this.tags),
    };
  }

  getIsSelected(id: string) {
    return !!this.selectedIds.find((s) => s === id);
  }

  getResult(id: string) {
    return this.results.find((r) => r.id === id);
  }
}
@model("medior/_FileSearch")
export class _FileSearch extends Model({
  bitrate: prop<{ logOp: LogicalOp | ""; value: number }>(() => ({ logOp: "", value: 0 })),
  dateCreatedEnd: prop<string>("").withSetter(),
  dateCreatedStart: prop<string>("").withSetter(),
  dateModifiedEnd: prop<string>("").withSetter(),
  dateModifiedStart: prop<string>("").withSetter(),
  duration: prop<{ logOp: LogicalOp | ""; value: number }>(() => ({ logOp: "", value: 0 })),
  excludedFileIds: prop<string[]>(() => []).withSetter(),
  forcePages: prop<boolean>(false).withSetter(),
  frameRate: prop<{ logOp: LogicalOp | ""; value: number }>(() => ({ logOp: "", value: 0 })),
  hasChanges: prop<boolean>(false).withSetter(),
  hasDiffParams: prop<boolean>(false).withSetter(),
  ids: prop<string[]>(() => []).withSetter(),
  isArchived: prop<boolean>(false).withSetter(),
  isCorrupted: prop<boolean>(null).withSetter(),
  isLoading: prop<boolean>(false).withSetter(),
  isModified: prop<boolean>(null).withSetter(),
  isPageCountLoading: prop<boolean>(false).withSetter(),
  maxHeight: prop<number>(null).withSetter(),
  maxSize: prop<number>(null).withSetter(),
  maxWidth: prop<number>(null).withSetter(),
  minHeight: prop<number>(null).withSetter(),
  minSize: prop<number>(null).withSetter(),
  minWidth: prop<number>(null).withSetter(),
  numOfTags: prop<{ logOp: LogicalOp | ""; value: number }>(() => ({ logOp: "", value: 0 })),
  originalPath: prop<string>(null).withSetter(),
  page: prop<number>(1).withSetter(),
  pageCount: prop<number>(1).withSetter(),
  pageSize: prop<number>(() => getConfig().file.search.pageSize).withSetter(),
  rating: prop<{ logOp: LogicalOp | ""; value: number }>(() => ({ logOp: "", value: 0 })),
  results: prop<Stores.File[]>(() => []).withSetter(),
  selectedAudioCodecs: prop<Types.SelectedAudioCodecs>(
    () =>
      Object.fromEntries(
        getConfig().file.audioCodecs.map((codec) => [codec, true]),
      ) as Types.SelectedAudioCodecs,
  ),
  selectedIds: prop<string[]>(() => []).withSetter(),
  selectedImageExts: prop<Types.SelectedImageExts>(
    () =>
      Object.fromEntries(
        getConfig().file.imageExts.map((ext) => [ext, true]),
      ) as Types.SelectedImageExts,
  ),
  selectedVideoCodecs: prop<Types.SelectedVideoCodecs>(
    () =>
      Object.fromEntries(
        getConfig().file.videoCodecs.map((codec) => [codec, true]),
      ) as Types.SelectedVideoCodecs,
  ),
  selectedVideoExts: prop<Types.SelectedVideoExts>(
    () =>
      Object.fromEntries(
        getConfig().file.videoExts.map((ext) => [ext, true]),
      ) as Types.SelectedVideoExts,
  ),
  sortValue: prop<SortMenuProps["value"]>(() => getConfig().file.search.sort).withSetter(),
  tags: prop<Stores.TagOption[]>(() => []).withSetter(),
}) {
  onInit() {
    autoBind(this);
  }

  /* STANDARD ACTIONS */
  @modelAction
  _addResult(result: ModelCreationData<Stores.File>) {
    this.results.push(new Stores.File(result));
  }

  @modelAction
  _deleteResults(ids: string[]) {
    this.results = this.results.filter((d) => !ids.includes(d.id));
  }

  @modelAction
  reset() {
    this.bitrate = { logOp: "", value: 0 };
    this.dateCreatedEnd = "";
    this.dateCreatedStart = "";
    this.dateModifiedEnd = "";
    this.dateModifiedStart = "";
    this.duration = { logOp: "", value: 0 };
    this.excludedFileIds = [];
    this.forcePages = false;
    this.frameRate = { logOp: "", value: 0 };
    this.hasChanges = false;
    this.hasDiffParams = false;
    this.ids = [];
    this.isArchived = false;
    this.isCorrupted = null;
    this.isLoading = false;
    this.isModified = null;
    this.isPageCountLoading = false;
    this.maxHeight = null;
    this.maxSize = null;
    this.maxWidth = null;
    this.minHeight = null;
    this.minSize = null;
    this.minWidth = null;
    this.numOfTags = { logOp: "", value: 0 };
    this.originalPath = null;
    this.page = 1;
    this.pageCount = 1;
    this.pageSize = getConfig().file.search.pageSize;
    this.rating = { logOp: "", value: 0 };
    this.results = [];
    this.selectedAudioCodecs = Object.fromEntries(
      getConfig().file.audioCodecs.map((codec) => [codec, true]),
    ) as Types.SelectedAudioCodecs;
    this.selectedIds = [];
    this.selectedImageExts = Object.fromEntries(
      getConfig().file.imageExts.map((ext) => [ext, true]),
    ) as Types.SelectedImageExts;
    this.selectedVideoCodecs = Object.fromEntries(
      getConfig().file.videoCodecs.map((codec) => [codec, true]),
    ) as Types.SelectedVideoCodecs;
    this.selectedVideoExts = Object.fromEntries(
      getConfig().file.videoExts.map((ext) => [ext, true]),
    ) as Types.SelectedVideoExts;
    this.sortValue = getConfig().file.search.sort;
    this.tags = [];
  }

  @modelAction
  toggleSelected(selected: { id: string; isSelected?: boolean }[], withToast = false) {
    if (!selected?.length) return;

    const [added, removed] = selected.reduce(
      (acc, cur) => (acc[cur.isSelected ? 0 : 1].push(cur.id), acc),
      [[], []],
    );

    const removedSet = new Set(removed);
    this.selectedIds = [...new Set(this.selectedIds.concat(added))].filter(
      (id) => !removedSet.has(id),
    );

    if (withToast) {
      const addedCount = added.length;
      const removedCount = removed.length;
      if (addedCount && removedCount)
        toast.success(`Selected ${addedCount} items and deselected ${removedCount} items`);
      else if (addedCount) toast.success(`Selected ${addedCount} items`);
      else if (removedCount) toast.success(`Deselected ${removedCount} items`);
    }
  }

  @modelAction
  setBitrateOp(val: LogicalOp | "") {
    this.bitrate.logOp = val;
    if (val === "") this.bitrate.value = 0;
  }

  @modelAction
  setBitrateValue(val: number) {
    this.bitrate.value = val;
  }

  @modelAction
  setDurationOp(val: LogicalOp | "") {
    this.duration.logOp = val;
    if (val === "") this.duration.value = 0;
  }

  @modelAction
  setDurationValue(val: number) {
    this.duration.value = val;
  }

  @modelAction
  setFrameRateOp(val: LogicalOp | "") {
    this.frameRate.logOp = val;
    if (val === "") this.frameRate.value = 0;
  }

  @modelAction
  setFrameRateValue(val: number) {
    this.frameRate.value = val;
  }

  @modelAction
  setNumOfTagsOp(val: LogicalOp | "") {
    this.numOfTags.logOp = val;
    if (val === "") this.numOfTags.value = 0;
  }

  @modelAction
  setNumOfTagsValue(val: number) {
    this.numOfTags.value = val;
  }

  @modelAction
  setRatingOp(val: LogicalOp | "") {
    this.rating.logOp = val;
    if (val === "") this.rating.value = 0;
  }

  @modelAction
  setRatingValue(val: number) {
    this.rating.value = val;
  }

  @modelAction
  setSelectedAudioCodecs(types: Partial<Types.SelectedAudioCodecs>) {
    this.selectedAudioCodecs = { ...this.selectedAudioCodecs, ...types };
  }

  @modelAction
  setSelectedImageExts(types: Partial<Types.SelectedImageExts>) {
    this.selectedImageExts = { ...this.selectedImageExts, ...types };
  }

  @modelAction
  setSelectedVideoCodecs(types: Partial<Types.SelectedVideoCodecs>) {
    this.selectedVideoCodecs = { ...this.selectedVideoCodecs, ...types };
  }

  @modelAction
  setSelectedVideoExts(types: Partial<Types.SelectedVideoExts>) {
    this.selectedVideoExts = { ...this.selectedVideoExts, ...types };
  }

  /* ASYNC ACTIONS */
  @modelFlow
  getShiftSelected = asyncAction(
    async ({ id, selectedIds }: { id: string; selectedIds: string[] }) => {
      const clickedIndex =
        (this.page - 1) * this.pageSize + this.results.findIndex((r) => r.id === id);

      this.setIsLoading(true);
      const res = await trpc.getShiftSelectedFile.mutate({
        ...this.getFilterProps(),
        clickedId: id,
        clickedIndex,
        selectedIds,
      });
      this.setIsLoading(false);

      if (!res.success) throw new Error(res.error);
      return res.data;
    },
  );

  @modelFlow
  handleSelect = asyncAction(
    async ({ hasCtrl, hasShift, id }: { hasCtrl: boolean; hasShift: boolean; id: string }) => {
      if (hasShift) {
        const res = await this.getShiftSelected({ id, selectedIds: this.selectedIds });
        if (!res?.success) throw new Error(res.error);
        this.toggleSelected([
          ...res.data.idsToDeselect.map((i) => ({ id: i, isSelected: false })),
          ...res.data.idsToSelect.map((i) => ({ id: i, isSelected: true })),
        ]);
      } else if (hasCtrl) {
        this.toggleSelected([{ id, isSelected: !this.getIsSelected(id) }]);
      } else {
        this.toggleSelected([
          ...this.selectedIds.map((id) => ({ id, isSelected: false })),
          { id, isSelected: true },
        ]);
      }
    },
  );

  @modelFlow
  loadFiltered = asyncAction(async ({ page }: { page?: number } = {}) => {
    const debug = false;
    const { perfLog } = makePerfLog("[FileSearch]");
    this.setIsLoading(true);
    this.setIsPageCountLoading(true);

    const itemsRes = await trpc.listFilteredFile.mutate({
      ...this.getFilterProps(),
      forcePages: this.forcePages,
      page: page ?? this.page,
      pageSize: this.pageSize,
    });
    if (!itemsRes.success) throw new Error(itemsRes.error);

    let items = itemsRes.data;
    if (debug) perfLog(`Loaded ${items.length} items`);

    const tagIds = [...new Set(items.flatMap((item) => item.tagIds))];
    const tags = (await trpc.listTag.mutate({ args: { filter: { id: tagIds } } })).data.items;
    items = items.map((item) => ({
      ...item,
      tags: tags.filter((t) => item.tagIds.includes(t.id)),
    }));

    const results = items;

    this.setResults(results.map((result) => new Stores.File(result)));
    if (debug) perfLog("Overwrite and re-render");

    if (page) this.setPage(page);
    if (debug && page) perfLog(`Set page to ${page ?? this.page}`);
    this.setIsLoading(false);
    this.setHasChanges(false);

    const countRes = await trpc.getFilteredFileCount.mutate({
      ...this.getFilterProps(),
      pageSize: this.pageSize,
    });
    if (!countRes.success) throw new Error(countRes.error);
    const pageCount = countRes.data.pageCount;
    this.setPageCount(pageCount);
    this.setIsPageCountLoading(false);
    if (debug) perfLog(`Set pageCount to ${pageCount}`);

    return results;
  });

  /* GETTERS */
  @computed
  get numOfFilters() {
    return (
      (!isDeepEqual(this.bitrate, { logOp: "", value: 0 }) ? 1 : 0) +
      (!isDeepEqual(this.dateCreatedEnd, "") ? 1 : 0) +
      (!isDeepEqual(this.dateCreatedStart, "") ? 1 : 0) +
      (!isDeepEqual(this.dateModifiedEnd, "") ? 1 : 0) +
      (!isDeepEqual(this.dateModifiedStart, "") ? 1 : 0) +
      (!isDeepEqual(this.duration, { logOp: "", value: 0 }) ? 1 : 0) +
      (!isDeepEqual(this.excludedFileIds, []) ? 1 : 0) +
      (!isDeepEqual(this.frameRate, { logOp: "", value: 0 }) ? 1 : 0) +
      (!isDeepEqual(this.hasDiffParams, false) ? 1 : 0) +
      (!isDeepEqual(this.ids, []) ? 1 : 0) +
      (!isDeepEqual(this.isArchived, false) ? 1 : 0) +
      (!isDeepEqual(this.isCorrupted, null) ? 1 : 0) +
      (!isDeepEqual(this.isModified, null) ? 1 : 0) +
      (!isDeepEqual(this.maxHeight, null) ? 1 : 0) +
      (!isDeepEqual(this.maxSize, null) ? 1 : 0) +
      (!isDeepEqual(this.maxWidth, null) ? 1 : 0) +
      (!isDeepEqual(this.minHeight, null) ? 1 : 0) +
      (!isDeepEqual(this.minSize, null) ? 1 : 0) +
      (!isDeepEqual(this.minWidth, null) ? 1 : 0) +
      (!isDeepEqual(this.numOfTags, { logOp: "", value: 0 }) ? 1 : 0) +
      (!isDeepEqual(this.originalPath, null) ? 1 : 0) +
      (!isDeepEqual(this.rating, { logOp: "", value: 0 }) ? 1 : 0) +
      (!isDeepEqual(
        this.selectedAudioCodecs,
        Object.fromEntries(
          getConfig().file.audioCodecs.map((codec) => [codec, true]),
        ) as Types.SelectedAudioCodecs,
      )
        ? 1
        : 0) +
      (!isDeepEqual(
        this.selectedImageExts,
        Object.fromEntries(
          getConfig().file.imageExts.map((ext) => [ext, true]),
        ) as Types.SelectedImageExts,
      )
        ? 1
        : 0) +
      (!isDeepEqual(
        this.selectedVideoCodecs,
        Object.fromEntries(
          getConfig().file.videoCodecs.map((codec) => [codec, true]),
        ) as Types.SelectedVideoCodecs,
      )
        ? 1
        : 0) +
      (!isDeepEqual(
        this.selectedVideoExts,
        Object.fromEntries(
          getConfig().file.videoExts.map((ext) => [ext, true]),
        ) as Types.SelectedVideoExts,
      )
        ? 1
        : 0) +
      (!isDeepEqual(this.sortValue, getConfig().file.search.sort) ? 1 : 0) +
      (!isDeepEqual(this.tags, []) ? 1 : 0)
    );
  }

  /* DYNAMIC GETTERS */
  getFilterProps() {
    return {
      bitrate: this.bitrate,
      dateCreatedEnd: this.dateCreatedEnd,
      dateCreatedStart: this.dateCreatedStart,
      dateModifiedEnd: this.dateModifiedEnd,
      dateModifiedStart: this.dateModifiedStart,
      duration: this.duration,
      excludedFileIds: this.excludedFileIds,
      frameRate: this.frameRate,
      hasDiffParams: this.hasDiffParams,
      ids: this.ids,
      isArchived: this.isArchived,
      isCorrupted: this.isCorrupted,
      isModified: this.isModified,
      maxHeight: this.maxHeight,
      maxSize: this.maxSize,
      maxWidth: this.maxWidth,
      minHeight: this.minHeight,
      minSize: this.minSize,
      minWidth: this.minWidth,
      numOfTags: this.numOfTags,
      originalPath: this.originalPath,
      rating: this.rating,
      selectedAudioCodecs: this.selectedAudioCodecs,
      selectedImageExts: this.selectedImageExts,
      selectedVideoCodecs: this.selectedVideoCodecs,
      selectedVideoExts: this.selectedVideoExts,
      sortValue: this.sortValue,
      ...getRootStore<Stores.RootStore>(this)?.tag?.tagSearchOptsToIds(this.tags),
    };
  }

  getIsSelected(id: string) {
    return !!this.selectedIds.find((s) => s === id);
  }

  getResult(id: string) {
    return this.results.find((r) => r.id === id);
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
  forcePages: prop<boolean>(false).withSetter(),
  hasChanges: prop<boolean>(false).withSetter(),
  ids: prop<string[]>(() => []).withSetter(),
  isLoading: prop<boolean>(false).withSetter(),
  isPageCountLoading: prop<boolean>(false).withSetter(),
  label: prop<string>("").withSetter(),
  page: prop<number>(1).withSetter(),
  pageCount: prop<number>(1).withSetter(),
  pageSize: prop<number>(() => getConfig().tags.manager.search.pageSize).withSetter(),
  regExMode: prop<"any" | "hasRegEx" | "hasNoRegEx">("any").withSetter(),
  results: prop<Stores.Tag[]>(() => []).withSetter(),
  selectedIds: prop<string[]>(() => []).withSetter(),
  sortValue: prop<SortMenuProps["value"]>(() => getConfig().tags.manager.search.sort).withSetter(),
  tags: prop<Stores.TagOption[]>(() => []).withSetter(),
  title: prop<string>("").withSetter(),
}) {
  onInit() {
    autoBind(this);
  }

  /* STANDARD ACTIONS */
  @modelAction
  _addResult(result: ModelCreationData<Stores.Tag>) {
    this.results.push(new Stores.Tag(result));
  }

  @modelAction
  _deleteResults(ids: string[]) {
    this.results = this.results.filter((d) => !ids.includes(d.id));
  }

  @modelAction
  reset() {
    this.alias = "";
    this.count = { logOp: "", value: 0 };
    this.dateCreatedEnd = "";
    this.dateCreatedStart = "";
    this.dateModifiedEnd = "";
    this.dateModifiedStart = "";
    this.forcePages = false;
    this.hasChanges = false;
    this.ids = [];
    this.isLoading = false;
    this.isPageCountLoading = false;
    this.label = "";
    this.page = 1;
    this.pageCount = 1;
    this.pageSize = getConfig().tags.manager.search.pageSize;
    this.regExMode = "any";
    this.results = [];
    this.selectedIds = [];
    this.sortValue = getConfig().tags.manager.search.sort;
    this.tags = [];
    this.title = "";
  }

  @modelAction
  toggleSelected(selected: { id: string; isSelected?: boolean }[], withToast = false) {
    if (!selected?.length) return;

    const [added, removed] = selected.reduce(
      (acc, cur) => (acc[cur.isSelected ? 0 : 1].push(cur.id), acc),
      [[], []],
    );

    const removedSet = new Set(removed);
    this.selectedIds = [...new Set(this.selectedIds.concat(added))].filter(
      (id) => !removedSet.has(id),
    );

    if (withToast) {
      const addedCount = added.length;
      const removedCount = removed.length;
      if (addedCount && removedCount)
        toast.success(`Selected ${addedCount} items and deselected ${removedCount} items`);
      else if (addedCount) toast.success(`Selected ${addedCount} items`);
      else if (removedCount) toast.success(`Deselected ${removedCount} items`);
    }
  }

  @modelAction
  setCountOp(val: LogicalOp | "") {
    this.count.logOp = val;
    if (val === "") this.count.value = 0;
  }

  @modelAction
  setCountValue(val: number) {
    this.count.value = val;
  }

  /* ASYNC ACTIONS */
  @modelFlow
  getShiftSelected = asyncAction(
    async ({ id, selectedIds }: { id: string; selectedIds: string[] }) => {
      const clickedIndex =
        (this.page - 1) * this.pageSize + this.results.findIndex((r) => r.id === id);

      this.setIsLoading(true);
      const res = await trpc.getShiftSelectedTag.mutate({
        ...this.getFilterProps(),
        clickedId: id,
        clickedIndex,
        selectedIds,
      });
      this.setIsLoading(false);

      if (!res.success) throw new Error(res.error);
      return res.data;
    },
  );

  @modelFlow
  handleSelect = asyncAction(
    async ({ hasCtrl, hasShift, id }: { hasCtrl: boolean; hasShift: boolean; id: string }) => {
      if (hasShift) {
        const res = await this.getShiftSelected({ id, selectedIds: this.selectedIds });
        if (!res?.success) throw new Error(res.error);
        this.toggleSelected([
          ...res.data.idsToDeselect.map((i) => ({ id: i, isSelected: false })),
          ...res.data.idsToSelect.map((i) => ({ id: i, isSelected: true })),
        ]);
      } else if (hasCtrl) {
        this.toggleSelected([{ id, isSelected: !this.getIsSelected(id) }]);
      } else {
        this.toggleSelected([
          ...this.selectedIds.map((id) => ({ id, isSelected: false })),
          { id, isSelected: true },
        ]);
      }
    },
  );

  @modelFlow
  loadFiltered = asyncAction(async ({ page }: { page?: number } = {}) => {
    const debug = false;
    const { perfLog } = makePerfLog("[TagSearch]");
    this.setIsLoading(true);
    this.setIsPageCountLoading(true);

    const itemsRes = await trpc.listFilteredTag.mutate({
      ...this.getFilterProps(),
      forcePages: this.forcePages,
      page: page ?? this.page,
      pageSize: this.pageSize,
    });
    if (!itemsRes.success) throw new Error(itemsRes.error);

    let items = itemsRes.data;
    if (debug) perfLog(`Loaded ${items.length} items`);

    const results = items;

    this.setResults(results.map((result) => new Stores.Tag(result)));
    if (debug) perfLog("Overwrite and re-render");

    if (page) this.setPage(page);
    if (debug && page) perfLog(`Set page to ${page ?? this.page}`);
    this.setIsLoading(false);
    this.setHasChanges(false);

    const countRes = await trpc.getFilteredTagCount.mutate({
      ...this.getFilterProps(),
      pageSize: this.pageSize,
    });
    if (!countRes.success) throw new Error(countRes.error);
    const pageCount = countRes.data.pageCount;
    this.setPageCount(pageCount);
    this.setIsPageCountLoading(false);
    if (debug) perfLog(`Set pageCount to ${pageCount}`);

    return results;
  });

  /* GETTERS */
  @computed
  get numOfFilters() {
    return (
      (!isDeepEqual(this.alias, "") ? 1 : 0) +
      (!isDeepEqual(this.count, { logOp: "", value: 0 }) ? 1 : 0) +
      (!isDeepEqual(this.dateCreatedEnd, "") ? 1 : 0) +
      (!isDeepEqual(this.dateCreatedStart, "") ? 1 : 0) +
      (!isDeepEqual(this.dateModifiedEnd, "") ? 1 : 0) +
      (!isDeepEqual(this.dateModifiedStart, "") ? 1 : 0) +
      (!isDeepEqual(this.ids, []) ? 1 : 0) +
      (!isDeepEqual(this.label, "") ? 1 : 0) +
      (!isDeepEqual(this.regExMode, "any") ? 1 : 0) +
      (!isDeepEqual(this.sortValue, getConfig().tags.manager.search.sort) ? 1 : 0) +
      (!isDeepEqual(this.tags, []) ? 1 : 0) +
      (!isDeepEqual(this.title, "") ? 1 : 0)
    );
  }

  /* DYNAMIC GETTERS */
  getFilterProps() {
    return {
      alias: this.alias,
      count: this.count,
      dateCreatedEnd: this.dateCreatedEnd,
      dateCreatedStart: this.dateCreatedStart,
      dateModifiedEnd: this.dateModifiedEnd,
      dateModifiedStart: this.dateModifiedStart,
      ids: this.ids,
      label: this.label,
      regExMode: this.regExMode,
      sortValue: this.sortValue,
      ...getRootStore<Stores.RootStore>(this)?.tag?.tagSearchOptsToIds(this.tags),
      title: this.title,
    };
  }

  getIsSelected(id: string) {
    return !!this.selectedIds.find((s) => s === id);
  }

  getResult(id: string) {
    return this.results.find((r) => r.id === id);
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
  id: prop<string>(),
  dateCreated: prop<string>(() => dayjs().toISOString()),
  hash: prop<string>(),
}) {
  @modelAction
  update(updates: Partial<ModelCreationData<this>>) {
    applySnapshot(this, { ...getSnapshot(this), ...updates });
  }
}

@model("medior/_DeletedFileStore")
export class _DeletedFileStore extends Model({ isLoading: prop<boolean>(false).withSetter() }) {
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
  id: prop<string>(),
  dateCreated: prop<string>(() => dayjs().toISOString()),
  dateModified: prop<string>(null),
  fileCount: prop<number>(0),
  fileIdIndexes: prop<Array<{ fileId: string; index: number }>>(),
  rating: prop<number>(0),
  tagIds: prop<string[]>(() => []),
  tagIdsWithAncestors: prop<string[]>(() => []),
  thumbs: prop<Array<{ frameHeight?: number; frameWidth?: number; path: string }>>(null),
  title: prop<string>(),
}) {
  @modelAction
  update(updates: Partial<ModelCreationData<this>>) {
    applySnapshot(this, { ...getSnapshot(this), ...updates });
  }
}

@model("medior/_FileCollectionStore")
export class _FileCollectionStore extends Model({ isLoading: prop<boolean>(false).withSetter() }) {
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
  id: prop<string>(),
  dateCreated: prop<string>(() => dayjs().toISOString()),
  collectionId: prop<string>(null),
  collectionTitle: prop<string>(null),
  completedAt: prop<string>(),
  deleteOnImport: prop<boolean>(),
  fileCount: prop<number>(0),
  ignorePrevDeleted: prop<boolean>(),
  imports: prop<Stores.FileImport[]>(() => []),
  isCompleted: prop<boolean>(false),
  remux: prop<boolean>(null),
  rootFolderPath: prop<string>(),
  size: prop<number>(null),
  startedAt: prop<string>(null),
  tagIds: prop<string[]>(() => []),
  tagIdsWithAncestors: prop<string[]>(() => []),
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
  hash: prop<string>(null),
  name: prop<string>(),
  path: prop<string>(),
  size: prop<number>(),
  status: prop<string | "COMPLETE" | "DELETED" | "DUPLICATE" | "ERROR" | "PENDING">(null),
  tagIds: prop<string[]>(null),
  thumb: prop<{ frameHeight?: number; frameWidth?: number; path: string }>(null),
}) {
  @modelAction
  update(updates: Partial<ModelCreationData<this>>) {
    applySnapshot(this, { ...getSnapshot(this), ...updates });
  }
}

@model("medior/_FileImportBatchStore")
export class _FileImportBatchStore extends Model({ isLoading: prop<boolean>(false).withSetter() }) {
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
  id: prop<string>(),
  dateCreated: prop<string>(() => dayjs().toISOString()),
  audioBitrate: prop<number>(null),
  audioCodec: prop<string>(null),
  bitrate: prop<number>(null),
  dateModified: prop<string>(),
  diffusionParams: prop<string>(null),
  duration: prop<number>(null),
  ext: prop<string>(),
  frameRate: prop<number>(null),
  hash: prop<string>(),
  height: prop<number>(),
  isArchived: prop<boolean>(null),
  isCorrupted: prop<boolean>(null),
  originalAudioBitrate: prop<number>(null),
  originalAudioCodec: prop<string>(null),
  originalBitrate: prop<number>(null),
  originalHash: prop<string>(null),
  originalName: prop<string>(null),
  originalPath: prop<string>(),
  originalSize: prop<number>(),
  originalVideoCodec: prop<string>(null),
  path: prop<string>(),
  rating: prop<number>(),
  size: prop<number>(),
  tagIds: prop<string[]>(),
  tagIdsWithAncestors: prop<string[]>(),
  thumb: prop<{ frameHeight?: number; frameWidth?: number; path: string }>(),
  videoCodec: prop<string>(null),
  width: prop<number>(),
}) {
  @modelAction
  update(updates: Partial<ModelCreationData<this>>) {
    applySnapshot(this, { ...getSnapshot(this), ...updates });
  }
}

@model("medior/_FileStore")
export class _FileStore extends Model({ isLoading: prop<boolean>(false).withSetter() }) {
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
  updateFile = asyncAction(async (args: Types.UpdateFileInput) => {
    this.setIsLoading(true);
    const res = await trpc.updateFile.mutate({ args });
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
  id: prop<string>(),
  dateCreated: prop<string>(() => dayjs().toISOString()),
  aliases: prop<string[]>(() => []),
  ancestorIds: prop<string[]>(() => []),
  childIds: prop<string[]>(() => []),
  count: prop<number>(),
  dateModified: prop<string>(),
  descendantIds: prop<string[]>(() => []),
  label: prop<string>(),
  lastSearchedAt: prop<string>(null),
  parentIds: prop<string[]>(() => []),
  regEx: prop<string>(null),
  thumb: prop<{ frameHeight?: number; frameWidth?: number; path: string }>(null),
}) {
  @modelAction
  update(updates: Partial<ModelCreationData<this>>) {
    applySnapshot(this, { ...getSnapshot(this), ...updates });
  }
}

@model("medior/_TagStore")
export class _TagStore extends Model({ isLoading: prop<boolean>(false).withSetter() }) {
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
