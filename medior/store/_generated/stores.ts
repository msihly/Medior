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
import { makePerfLog } from "trabecula/utils/server";
import * as Types from "medior/server/database/types";
import { IconName, SortMenuProps } from "medior/components";
import * as Stores from "medior/store";
import { asyncAction, CssColor, derefMobx, toast } from "medior/utils/client";
import { dayjs, isDeepEqual, LogicalOp } from "medior/utils/common";
import { getConfig, trpc } from "medior/utils/server";

/* --------------------------------------------------------------------------- */
/*                               SEARCH STORES
/* --------------------------------------------------------------------------- */

@model("medior/_FileCollectionSearch")
export class _FileCollectionSearch extends Model({
  cachedFilterProps: prop<object | null>(null).withSetter(),
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
  loadId: prop<number>(0).withSetter(),
  maxSize: prop<number>(null).withSetter(),
  minSize: prop<number>(null).withSetter(),
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
  isDeleteModalOpen: prop<boolean>(false).withSetter(),
  isSaveModalOpen: prop<boolean>(false).withSetter(),
  savedSearches: prop<Stores.SavedSearch[]>(() => []).withSetter(),
  selectedSavedSearchId: prop<string>("").withSetter(),
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
  applySearchProps(searchProps: Record<string, any>) {
    this.reset();
    Object.entries(searchProps).forEach(([key, value]) => {
      if (key in this) this[key] = value;
    });
    this.cachedFilterProps = null;
    this.hasChanges = true;
    this.page = 1;
    (this as any).afterApplySearchProps?.(searchProps);
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

  @modelAction
  _deleteResults(ids: string[]) {
    this.results = this.results.filter((d) => !ids.includes(d.id));
  }

  @modelAction
  reset() {
    this.cachedFilterProps = null;
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
    this.loadId = 0;
    this.maxSize = null;
    this.minSize = null;
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

  /* ASYNC ACTIONS */
  @modelFlow
  applySavedSearch = asyncAction(async (id: string) => {
    if (!this.savedSearches.some((s) => s.id === id)) await this.loadSavedSearches();
    const savedSearch = this.savedSearches.find((s) => s.id === id);
    if (!savedSearch) return;

    this.applySearchProps(derefMobx(savedSearch.filterProps));
    this.setSelectedSavedSearchId(id);
    await this.loadFiltered({ noCache: true, page: 1 });
  });

  @modelFlow
  deleteSavedSearch = asyncAction(async (id: string = this.selectedSavedSearchId) => {
    if (!id) return;

    const res = await trpc.deleteSavedSearch.mutate({ args: { ids: [id] } });
    if (!res.success) throw new Error(res.error);

    await this.loadSavedSearches();
    if (this.selectedSavedSearchId === id) this.setSelectedSavedSearchId("");
    this.setIsDeleteModalOpen(false);
    toast.warn("Saved search deleted");
  });

  @modelFlow
  getShiftSelected = asyncAction(
    async ({ id, selectedIds }: { id: string; selectedIds: string[] }) => {
      const clickedLocalIndex = this.results.findIndex((r) => r.id === id);

      const selectedLocalIndexes = selectedIds
        .map((sid) => this.results.findIndex((r) => r.id === sid))
        .filter((i) => i > -1);

      const canResolveLocally =
        clickedLocalIndex > -1 &&
        selectedLocalIndexes.length === selectedIds.length &&
        this.results.length > 0;

      if (canResolveLocally) {
        const firstSelected = Math.min(...selectedLocalIndexes);
        const lastSelected = Math.max(...selectedLocalIndexes);
        if (firstSelected === clickedLocalIndex) return { idsToSelect: [], idsToDeselect: [id] };

        const isFirstAfterClicked = firstSelected > clickedLocalIndex;
        const start = isFirstAfterClicked ? clickedLocalIndex : firstSelected;
        const end = isFirstAfterClicked ? lastSelected : clickedLocalIndex;

        const newIds = this.results.slice(start, end + 1).map((r) => r.id);
        const idsToSelect = newIds.filter((i) => !selectedIds.includes(i));
        const idsToDeselect = selectedIds.filter((i) => !newIds.includes(i));

        return { idsToSelect, idsToDeselect };
      }

      const clickedIndex = (this.page - 1) * this.pageSize + clickedLocalIndex;

      this.setIsLoading(true);
      const res = await trpc.getShiftSelectedFileCollection.mutate({
        ...this.cachedFilterProps,
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
  selectAllInQuery = asyncAction(async () => {
    const countRes = await trpc.getFilteredFileCollectionCount.mutate({
      ...this.getFilterProps(),
      curMaxPage: this.pageCount,
      page: this.page,
      pageSize: this.pageSize,
      withFull: true,
    });
    if (!countRes.success) throw new Error(countRes.error);
    if (countRes.data.count === 0) return 0;

    const res = await trpc.listFilteredFileCollection.mutate({
      ...this.getFilterProps(),
      page: 1,
      pageSize: countRes.data.count,
      select: { _id: 1 },
    });
    if (!res.success) throw new Error(res.error);

    this.toggleSelected(res.data.map(({ id }) => ({ id, isSelected: true })));
    return res.data.length;
  });

  @modelFlow
  loadFiltered = asyncAction(
    async ({
      noCache,
      page,
      withFullCount,
    }: { noCache?: boolean; page?: number; withFullCount?: boolean } = {}) => {
      const debug = false;
      const { perfLog } = makePerfLog("[FileCollectionSearch]");
      const loadId = this.loadId + 1;
      this.setLoadId(loadId);
      this.setIsLoading(true);
      this.setIsPageCountLoading(true);

      const filterProps = noCache ? this.getFilterProps() : this.getCachedFilterProps();
      if (noCache || !this.cachedFilterProps) this.setCachedFilterProps(derefMobx(filterProps));

      if (withFullCount) {
        const countRes = await trpc.getFilteredFileCollectionCount.mutate({
          ...filterProps,
          curMaxPage: this.pageCount,
          page,
          pageSize: this.pageSize,
          withFull: withFullCount,
        });
        if (loadId !== this.loadId) return;
        if (!countRes.success) throw new Error(countRes.error);
        const pageCount = countRes.data.pageCount;

        this.setPageCount(pageCount);
        this.setIsPageCountLoading(false);
        if (debug) perfLog(`Set pageCount to ${pageCount}`);

        page = pageCount;
      }

      const newPage = page ?? this.page;
      this.setPage(newPage);
      if (debug && page) perfLog(`Set page to ${page ?? this.page}`);

      const itemsRes = await trpc.listFilteredFileCollection.mutate({
        ...filterProps,
        forcePages: this.forcePages,
        page: newPage,
        pageSize: this.pageSize,
      });
      if (loadId !== this.loadId) return;
      if (!itemsRes.success) throw new Error(itemsRes.error);

      let items = itemsRes.data;
      if (debug) perfLog(`Loaded ${items.length} items`);

      const tagIds = [...new Set(items.flatMap((item) => item.tagIdsWithAncestors))];
      const tags = (await trpc.listTag.mutate({ filter: { id: tagIds } })).data;

      if (loadId !== this.loadId) return;

      items = await Promise.all(
        items.map(async (item) => ({
          ...item,
          tags: tags.filter((t) => item.tagIds.includes(t.id)),
        })),
      );

      const results = items;

      this.setResults(results.map((result) => new Stores.FileCollection(result)));
      if (debug) perfLog("Overwrite and re-render");

      this.setIsLoading(false);
      if (noCache) this.setHasChanges(false);

      if (!withFullCount) {
        trpc.getFilteredFileCollectionCount
          .mutate({
            ...filterProps,
            curMaxPage: this.pageCount,
            page,
            pageSize: this.pageSize,
            withFull: withFullCount,
          })
          .then((countRes) => {
            if (loadId !== this.loadId) return;
            this.setIsPageCountLoading(false);
            if (!countRes.success) return console.error(countRes.error);
            const pageCount = countRes.data.pageCount;

            this.setPageCount(pageCount);
            if (debug) perfLog(`Set pageCount to ${pageCount}`);
          });
      }

      return results;
    },
  );

  @modelFlow
  loadSavedSearches = asyncAction(async () => {
    const res = await trpc.listSavedSearch.mutate({
      args: {
        filter: { searchType: "FileCollection" },
        page: 1,
        pageSize: 1000,
        sort: { label: "asc" },
      },
    });
    if (!res.success) throw new Error(res.error);
    this.setSavedSearches(res.data.items.map((result) => new Stores.SavedSearch(result)));
    return res.data.items;
  });

  @modelFlow
  saveSavedSearch = asyncAction(async (label: string) => {
    const trimmedLabel = label.trim();
    if (!trimmedLabel) throw new Error("Saved search label is required");

    const existing = this.savedSearches.find((s) => s.label === trimmedLabel);
    const selected = this.savedSearches.find((s) => s.id === this.selectedSavedSearchId);
    const filterProps = this.getSearchProps();

    if (selected) {
      const res = await trpc.updateSavedSearch.mutate({
        args: { id: selected.id, updates: { filterProps, label: trimmedLabel } },
      });
      if (!res.success) throw new Error(res.error);
      await this.loadSavedSearches();
      this.setSelectedSavedSearchId(selected.id);
      this.setIsSaveModalOpen(false);
      toast.success("Saved search updated");
      return res.data;
    }

    if (existing) {
      const res = await trpc.updateSavedSearch.mutate({
        args: { id: existing.id, updates: { filterProps } },
      });
      if (!res.success) throw new Error(res.error);
      await this.loadSavedSearches();
      this.setSelectedSavedSearchId(existing.id);
      this.setIsSaveModalOpen(false);
      toast.success("Saved search updated");
      return res.data;
    }

    const res = await trpc.createSavedSearch.mutate({
      args: {
        dateCreated: dayjs().toISOString(),
        filterProps,
        label: trimmedLabel,
        searchType: "FileCollection",
      },
    });
    if (!res.success) throw new Error(res.error);

    await this.loadSavedSearches();
    this.setSelectedSavedSearchId(res.data.id);
    this.setIsSaveModalOpen(false);
    toast.success("Saved search created");
    return res.data;
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
      (!isDeepEqual(this.maxSize, null) ? 1 : 0) +
      (!isDeepEqual(this.minSize, null) ? 1 : 0) +
      (!isDeepEqual(this.rating, { logOp: "", value: 0 }) ? 1 : 0) +
      (!isDeepEqual(this.sortValue, getConfig().collection.manager.search.sort) ? 1 : 0) +
      (!isDeepEqual(this.tags, []) ? 1 : 0) +
      (!isDeepEqual(this.title, "") ? 1 : 0)
    );
  }

  /* DYNAMIC GETTERS */
  getCachedFilterProps() {
    if (!this.cachedFilterProps) this.setCachedFilterProps(derefMobx(this.getFilterProps()));
    return this.cachedFilterProps;
  }

  getFilterProps() {
    return {
      dateCreatedEnd: this.dateCreatedEnd,
      dateCreatedStart: this.dateCreatedStart,
      dateModifiedEnd: this.dateModifiedEnd,
      dateModifiedStart: this.dateModifiedStart,
      fileCount: this.fileCount,
      ids: this.ids,
      maxSize: this.maxSize,
      minSize: this.minSize,
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
  getSearchProps() {
    return derefMobx({
      dateCreatedEnd: this.dateCreatedEnd,
      dateCreatedStart: this.dateCreatedStart,
      dateModifiedEnd: this.dateModifiedEnd,
      dateModifiedStart: this.dateModifiedStart,
      fileCount: this.fileCount,
      ids: this.ids,
      maxSize: this.maxSize,
      minSize: this.minSize,
      rating: this.rating,
      sortValue: this.sortValue,
      tags: this.tags,
      title: this.title,
    });
  }
}
@model("medior/_FileImportBatchSearch")
export class _FileImportBatchSearch extends Model({
  cachedFilterProps: prop<object | null>(null).withSetter(),
  collectionTitle: prop<string>("").withSetter(),
  completedAtEnd: prop<string>("").withSetter(),
  completedAtStart: prop<string>("").withSetter(),
  dateCreatedEnd: prop<string>("").withSetter(),
  dateCreatedStart: prop<string>("").withSetter(),
  fileCount: prop<{ logOp: LogicalOp | ""; value: number }>(() => ({ logOp: "", value: 0 })),
  filePath: prop<string>(null).withSetter(),
  forcePages: prop<boolean>(false).withSetter(),
  hasChanges: prop<boolean>(false).withSetter(),
  ids: prop<string[]>(() => []).withSetter(),
  isCompleted: prop<boolean>(false).withSetter(),
  isLoading: prop<boolean>(false).withSetter(),
  isPageCountLoading: prop<boolean>(false).withSetter(),
  loadId: prop<number>(0).withSetter(),
  page: prop<number>(1).withSetter(),
  pageCount: prop<number>(1).withSetter(),
  pageSize: prop<number>(() => getConfig().imports.manager.search.pageSize).withSetter(),
  results: prop<Stores.FileImportBatch[]>(() => []).withSetter(),
  selectedIds: prop<string[]>(() => []).withSetter(),
  sortValue: prop<SortMenuProps["value"]>(
    () => getConfig().imports.manager.search.sort,
  ).withSetter(),
  startedAtEnd: prop<string>("").withSetter(),
  startedAtStart: prop<string>("").withSetter(),
  tags: prop<Stores.TagOption[]>(() => []).withSetter(),
  isDeleteModalOpen: prop<boolean>(false).withSetter(),
  isSaveModalOpen: prop<boolean>(false).withSetter(),
  savedSearches: prop<Stores.SavedSearch[]>(() => []).withSetter(),
  selectedSavedSearchId: prop<string>("").withSetter(),
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
  applySearchProps(searchProps: Record<string, any>) {
    this.reset();
    Object.entries(searchProps).forEach(([key, value]) => {
      if (key in this) this[key] = value;
    });
    this.cachedFilterProps = null;
    this.hasChanges = true;
    this.page = 1;
    (this as any).afterApplySearchProps?.(searchProps);
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
  _deleteResults(ids: string[]) {
    this.results = this.results.filter((d) => !ids.includes(d.id));
  }

  @modelAction
  reset() {
    this.cachedFilterProps = null;
    this.collectionTitle = "";
    this.completedAtEnd = "";
    this.completedAtStart = "";
    this.dateCreatedEnd = "";
    this.dateCreatedStart = "";
    this.fileCount = { logOp: "", value: 0 };
    this.filePath = null;
    this.forcePages = false;
    this.hasChanges = false;
    this.ids = [];
    this.isCompleted = false;
    this.isLoading = false;
    this.isPageCountLoading = false;
    this.loadId = 0;
    this.page = 1;
    this.pageCount = 1;
    this.pageSize = getConfig().imports.manager.search.pageSize;
    this.results = [];
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

  /* ASYNC ACTIONS */
  @modelFlow
  applySavedSearch = asyncAction(async (id: string) => {
    if (!this.savedSearches.some((s) => s.id === id)) await this.loadSavedSearches();
    const savedSearch = this.savedSearches.find((s) => s.id === id);
    if (!savedSearch) return;

    this.applySearchProps(derefMobx(savedSearch.filterProps));
    this.setSelectedSavedSearchId(id);
    await this.loadFiltered({ noCache: true, page: 1 });
  });

  @modelFlow
  deleteSavedSearch = asyncAction(async (id: string = this.selectedSavedSearchId) => {
    if (!id) return;

    const res = await trpc.deleteSavedSearch.mutate({ args: { ids: [id] } });
    if (!res.success) throw new Error(res.error);

    await this.loadSavedSearches();
    if (this.selectedSavedSearchId === id) this.setSelectedSavedSearchId("");
    this.setIsDeleteModalOpen(false);
    toast.warn("Saved search deleted");
  });

  @modelFlow
  getShiftSelected = asyncAction(
    async ({ id, selectedIds }: { id: string; selectedIds: string[] }) => {
      const clickedLocalIndex = this.results.findIndex((r) => r.id === id);

      const selectedLocalIndexes = selectedIds
        .map((sid) => this.results.findIndex((r) => r.id === sid))
        .filter((i) => i > -1);

      const canResolveLocally =
        clickedLocalIndex > -1 &&
        selectedLocalIndexes.length === selectedIds.length &&
        this.results.length > 0;

      if (canResolveLocally) {
        const firstSelected = Math.min(...selectedLocalIndexes);
        const lastSelected = Math.max(...selectedLocalIndexes);
        if (firstSelected === clickedLocalIndex) return { idsToSelect: [], idsToDeselect: [id] };

        const isFirstAfterClicked = firstSelected > clickedLocalIndex;
        const start = isFirstAfterClicked ? clickedLocalIndex : firstSelected;
        const end = isFirstAfterClicked ? lastSelected : clickedLocalIndex;

        const newIds = this.results.slice(start, end + 1).map((r) => r.id);
        const idsToSelect = newIds.filter((i) => !selectedIds.includes(i));
        const idsToDeselect = selectedIds.filter((i) => !newIds.includes(i));

        return { idsToSelect, idsToDeselect };
      }

      const clickedIndex = (this.page - 1) * this.pageSize + clickedLocalIndex;

      this.setIsLoading(true);
      const res = await trpc.getShiftSelectedFileImportBatch.mutate({
        ...this.cachedFilterProps,
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
  selectAllInQuery = asyncAction(async () => {
    const countRes = await trpc.getFilteredFileImportBatchCount.mutate({
      ...this.getFilterProps(),
      curMaxPage: this.pageCount,
      page: this.page,
      pageSize: this.pageSize,
      withFull: true,
    });
    if (!countRes.success) throw new Error(countRes.error);
    if (countRes.data.count === 0) return 0;

    const res = await trpc.listFilteredFileImportBatch.mutate({
      ...this.getFilterProps(),
      page: 1,
      pageSize: countRes.data.count,
      select: { _id: 1 },
    });
    if (!res.success) throw new Error(res.error);

    this.toggleSelected(res.data.map(({ id }) => ({ id, isSelected: true })));
    return res.data.length;
  });

  @modelFlow
  loadFiltered = asyncAction(
    async ({
      noCache,
      page,
      withFullCount,
    }: { noCache?: boolean; page?: number; withFullCount?: boolean } = {}) => {
      const debug = false;
      const { perfLog } = makePerfLog("[FileImportBatchSearch]");
      const loadId = this.loadId + 1;
      this.setLoadId(loadId);
      this.setIsLoading(true);
      this.setIsPageCountLoading(true);

      const filterProps = noCache ? this.getFilterProps() : this.getCachedFilterProps();
      if (noCache || !this.cachedFilterProps) this.setCachedFilterProps(derefMobx(filterProps));

      if (withFullCount) {
        const countRes = await trpc.getFilteredFileImportBatchCount.mutate({
          ...filterProps,
          curMaxPage: this.pageCount,
          page,
          pageSize: this.pageSize,
          withFull: withFullCount,
        });
        if (loadId !== this.loadId) return;
        if (!countRes.success) throw new Error(countRes.error);
        const pageCount = countRes.data.pageCount;

        this.setPageCount(pageCount);
        this.setIsPageCountLoading(false);
        if (debug) perfLog(`Set pageCount to ${pageCount}`);

        page = pageCount;
      }

      const newPage = page ?? this.page;
      this.setPage(newPage);
      if (debug && page) perfLog(`Set page to ${page ?? this.page}`);

      const itemsRes = await trpc.listFilteredFileImportBatch.mutate({
        ...filterProps,
        forcePages: this.forcePages,
        page: newPage,
        pageSize: this.pageSize,
      });
      if (loadId !== this.loadId) return;
      if (!itemsRes.success) throw new Error(itemsRes.error);

      let items = itemsRes.data;
      if (debug) perfLog(`Loaded ${items.length} items`);

      const tagIds = [...new Set(items.flatMap((item) => item.tagIdsWithAncestors))];
      const tags = (await trpc.listTag.mutate({ filter: { id: tagIds } })).data;

      if (loadId !== this.loadId) return;

      items = await Promise.all(
        items.map(async (item) => ({
          ...item,
          tags: tags.filter((t) => item.tagIds.includes(t.id)),
        })),
      );

      const results = items.map((batch) => ({
        ...batch,
        imports: batch.imports.map((imp) => new Stores.FileImport(imp)),
      }));

      this.setResults(results.map((result) => new Stores.FileImportBatch(result)));
      if (debug) perfLog("Overwrite and re-render");

      this.setIsLoading(false);
      if (noCache) this.setHasChanges(false);

      if (!withFullCount) {
        trpc.getFilteredFileImportBatchCount
          .mutate({
            ...filterProps,
            curMaxPage: this.pageCount,
            page,
            pageSize: this.pageSize,
            withFull: withFullCount,
          })
          .then((countRes) => {
            if (loadId !== this.loadId) return;
            this.setIsPageCountLoading(false);
            if (!countRes.success) return console.error(countRes.error);
            const pageCount = countRes.data.pageCount;

            this.setPageCount(pageCount);
            if (debug) perfLog(`Set pageCount to ${pageCount}`);
          });
      }

      return results;
    },
  );

  @modelFlow
  loadSavedSearches = asyncAction(async () => {
    const res = await trpc.listSavedSearch.mutate({
      args: {
        filter: { searchType: "FileImportBatch" },
        page: 1,
        pageSize: 1000,
        sort: { label: "asc" },
      },
    });
    if (!res.success) throw new Error(res.error);
    this.setSavedSearches(res.data.items.map((result) => new Stores.SavedSearch(result)));
    return res.data.items;
  });

  @modelFlow
  saveSavedSearch = asyncAction(async (label: string) => {
    const trimmedLabel = label.trim();
    if (!trimmedLabel) throw new Error("Saved search label is required");

    const existing = this.savedSearches.find((s) => s.label === trimmedLabel);
    const selected = this.savedSearches.find((s) => s.id === this.selectedSavedSearchId);
    const filterProps = this.getSearchProps();

    if (selected) {
      const res = await trpc.updateSavedSearch.mutate({
        args: { id: selected.id, updates: { filterProps, label: trimmedLabel } },
      });
      if (!res.success) throw new Error(res.error);
      await this.loadSavedSearches();
      this.setSelectedSavedSearchId(selected.id);
      this.setIsSaveModalOpen(false);
      toast.success("Saved search updated");
      return res.data;
    }

    if (existing) {
      const res = await trpc.updateSavedSearch.mutate({
        args: { id: existing.id, updates: { filterProps } },
      });
      if (!res.success) throw new Error(res.error);
      await this.loadSavedSearches();
      this.setSelectedSavedSearchId(existing.id);
      this.setIsSaveModalOpen(false);
      toast.success("Saved search updated");
      return res.data;
    }

    const res = await trpc.createSavedSearch.mutate({
      args: {
        dateCreated: dayjs().toISOString(),
        filterProps,
        label: trimmedLabel,
        searchType: "FileImportBatch",
      },
    });
    if (!res.success) throw new Error(res.error);

    await this.loadSavedSearches();
    this.setSelectedSavedSearchId(res.data.id);
    this.setIsSaveModalOpen(false);
    toast.success("Saved search created");
    return res.data;
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
      (!isDeepEqual(this.filePath, null) ? 1 : 0) +
      (!isDeepEqual(this.ids, []) ? 1 : 0) +
      (!isDeepEqual(this.isCompleted, false) ? 1 : 0) +
      (!isDeepEqual(this.sortValue, getConfig().imports.manager.search.sort) ? 1 : 0) +
      (!isDeepEqual(this.startedAtEnd, "") ? 1 : 0) +
      (!isDeepEqual(this.startedAtStart, "") ? 1 : 0) +
      (!isDeepEqual(this.tags, []) ? 1 : 0)
    );
  }

  /* DYNAMIC GETTERS */
  getCachedFilterProps() {
    if (!this.cachedFilterProps) this.setCachedFilterProps(derefMobx(this.getFilterProps()));
    return this.cachedFilterProps;
  }

  getFilterProps() {
    return {
      collectionTitle: this.collectionTitle,
      completedAtEnd: this.completedAtEnd,
      completedAtStart: this.completedAtStart,
      dateCreatedEnd: this.dateCreatedEnd,
      dateCreatedStart: this.dateCreatedStart,
      fileCount: this.fileCount,
      filePath: this.filePath,
      ids: this.ids,
      isCompleted: this.isCompleted,
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
  getSearchProps() {
    return derefMobx({
      collectionTitle: this.collectionTitle,
      completedAtEnd: this.completedAtEnd,
      completedAtStart: this.completedAtStart,
      dateCreatedEnd: this.dateCreatedEnd,
      dateCreatedStart: this.dateCreatedStart,
      fileCount: this.fileCount,
      filePath: this.filePath,
      ids: this.ids,
      isCompleted: this.isCompleted,
      sortValue: this.sortValue,
      startedAtEnd: this.startedAtEnd,
      startedAtStart: this.startedAtStart,
      tags: this.tags,
    });
  }
}
@model("medior/_FileTransformSearch")
export class _FileTransformSearch extends Model({
  afterSize: prop<{ logOp: LogicalOp | ""; value: number }>(() => ({ logOp: "", value: 0 })),
  beforePath: prop<string>(null).withSetter(),
  beforeSize: prop<{ logOp: LogicalOp | ""; value: number }>(() => ({ logOp: "", value: 0 })),
  cachedFilterProps: prop<object | null>(null).withSetter(),
  completedAtEnd: prop<string>("").withSetter(),
  completedAtStart: prop<string>("").withSetter(),
  dateCreatedEnd: prop<string>("").withSetter(),
  dateCreatedStart: prop<string>("").withSetter(),
  forcePages: prop<boolean>(false).withSetter(),
  hasChanges: prop<boolean>(false).withSetter(),
  ids: prop<string[]>(() => []).withSetter(),
  isCompleted: prop<boolean>(false).withSetter(),
  isLoading: prop<boolean>(false).withSetter(),
  isPageCountLoading: prop<boolean>(false).withSetter(),
  loadId: prop<number>(0).withSetter(),
  page: prop<number>(1).withSetter(),
  pageCount: prop<number>(1).withSetter(),
  pageSize: prop<number>(() => getConfig().file.transforms.search.pageSize).withSetter(),
  results: prop<Stores.FileTransform[]>(() => []).withSetter(),
  selectedIds: prop<string[]>(() => []).withSetter(),
  sortValue: prop<SortMenuProps["value"]>(
    () => getConfig().file.transforms.search.sort,
  ).withSetter(),
  startedAtEnd: prop<string>("").withSetter(),
  startedAtStart: prop<string>("").withSetter(),
  status: prop<string>("").withSetter(),
  type: prop<string>("").withSetter(),
  isDeleteModalOpen: prop<boolean>(false).withSetter(),
  isSaveModalOpen: prop<boolean>(false).withSetter(),
  savedSearches: prop<Stores.SavedSearch[]>(() => []).withSetter(),
  selectedSavedSearchId: prop<string>("").withSetter(),
}) {
  onInit() {
    autoBind(this);
  }

  /* STANDARD ACTIONS */
  @modelAction
  _addResult(result: ModelCreationData<Stores.FileTransform>) {
    this.results.push(new Stores.FileTransform(result));
  }

  @modelAction
  applySearchProps(searchProps: Record<string, any>) {
    this.reset();
    Object.entries(searchProps).forEach(([key, value]) => {
      if (key in this) this[key] = value;
    });
    this.cachedFilterProps = null;
    this.hasChanges = true;
    this.page = 1;
    (this as any).afterApplySearchProps?.(searchProps);
  }

  @modelAction
  setAfterSizeOp(val: LogicalOp | "") {
    this.afterSize.logOp = val;
    if (val === "") this.afterSize.value = 0;
  }

  @modelAction
  setAfterSizeValue(val: number) {
    this.afterSize.value = val;
  }

  @modelAction
  setBeforeSizeOp(val: LogicalOp | "") {
    this.beforeSize.logOp = val;
    if (val === "") this.beforeSize.value = 0;
  }

  @modelAction
  setBeforeSizeValue(val: number) {
    this.beforeSize.value = val;
  }

  @modelAction
  _deleteResults(ids: string[]) {
    this.results = this.results.filter((d) => !ids.includes(d.id));
  }

  @modelAction
  reset() {
    this.afterSize = { logOp: "", value: 0 };
    this.beforePath = null;
    this.beforeSize = { logOp: "", value: 0 };
    this.cachedFilterProps = null;
    this.completedAtEnd = "";
    this.completedAtStart = "";
    this.dateCreatedEnd = "";
    this.dateCreatedStart = "";
    this.forcePages = false;
    this.hasChanges = false;
    this.ids = [];
    this.isCompleted = false;
    this.isLoading = false;
    this.isPageCountLoading = false;
    this.loadId = 0;
    this.page = 1;
    this.pageCount = 1;
    this.pageSize = getConfig().file.transforms.search.pageSize;
    this.results = [];
    this.selectedIds = [];
    this.sortValue = getConfig().file.transforms.search.sort;
    this.startedAtEnd = "";
    this.startedAtStart = "";
    this.status = "";
    this.type = "";
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

  /* ASYNC ACTIONS */
  @modelFlow
  applySavedSearch = asyncAction(async (id: string) => {
    if (!this.savedSearches.some((s) => s.id === id)) await this.loadSavedSearches();
    const savedSearch = this.savedSearches.find((s) => s.id === id);
    if (!savedSearch) return;

    this.applySearchProps(derefMobx(savedSearch.filterProps));
    this.setSelectedSavedSearchId(id);
    await this.loadFiltered({ noCache: true, page: 1 });
  });

  @modelFlow
  deleteSavedSearch = asyncAction(async (id: string = this.selectedSavedSearchId) => {
    if (!id) return;

    const res = await trpc.deleteSavedSearch.mutate({ args: { ids: [id] } });
    if (!res.success) throw new Error(res.error);

    await this.loadSavedSearches();
    if (this.selectedSavedSearchId === id) this.setSelectedSavedSearchId("");
    this.setIsDeleteModalOpen(false);
    toast.warn("Saved search deleted");
  });

  @modelFlow
  getShiftSelected = asyncAction(
    async ({ id, selectedIds }: { id: string; selectedIds: string[] }) => {
      const clickedLocalIndex = this.results.findIndex((r) => r.id === id);

      const selectedLocalIndexes = selectedIds
        .map((sid) => this.results.findIndex((r) => r.id === sid))
        .filter((i) => i > -1);

      const canResolveLocally =
        clickedLocalIndex > -1 &&
        selectedLocalIndexes.length === selectedIds.length &&
        this.results.length > 0;

      if (canResolveLocally) {
        const firstSelected = Math.min(...selectedLocalIndexes);
        const lastSelected = Math.max(...selectedLocalIndexes);
        if (firstSelected === clickedLocalIndex) return { idsToSelect: [], idsToDeselect: [id] };

        const isFirstAfterClicked = firstSelected > clickedLocalIndex;
        const start = isFirstAfterClicked ? clickedLocalIndex : firstSelected;
        const end = isFirstAfterClicked ? lastSelected : clickedLocalIndex;

        const newIds = this.results.slice(start, end + 1).map((r) => r.id);
        const idsToSelect = newIds.filter((i) => !selectedIds.includes(i));
        const idsToDeselect = selectedIds.filter((i) => !newIds.includes(i));

        return { idsToSelect, idsToDeselect };
      }

      const clickedIndex = (this.page - 1) * this.pageSize + clickedLocalIndex;

      this.setIsLoading(true);
      const res = await trpc.getShiftSelectedFileTransform.mutate({
        ...this.cachedFilterProps,
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
  selectAllInQuery = asyncAction(async () => {
    const countRes = await trpc.getFilteredFileTransformCount.mutate({
      ...this.getFilterProps(),
      curMaxPage: this.pageCount,
      page: this.page,
      pageSize: this.pageSize,
      withFull: true,
    });
    if (!countRes.success) throw new Error(countRes.error);
    if (countRes.data.count === 0) return 0;

    const res = await trpc.listFilteredFileTransform.mutate({
      ...this.getFilterProps(),
      page: 1,
      pageSize: countRes.data.count,
      select: { _id: 1 },
    });
    if (!res.success) throw new Error(res.error);

    this.toggleSelected(res.data.map(({ id }) => ({ id, isSelected: true })));
    return res.data.length;
  });

  @modelFlow
  loadFiltered = asyncAction(
    async ({
      noCache,
      page,
      withFullCount,
    }: { noCache?: boolean; page?: number; withFullCount?: boolean } = {}) => {
      const debug = false;
      const { perfLog } = makePerfLog("[FileTransformSearch]");
      const loadId = this.loadId + 1;
      this.setLoadId(loadId);
      this.setIsLoading(true);
      this.setIsPageCountLoading(true);

      const filterProps = noCache ? this.getFilterProps() : this.getCachedFilterProps();
      if (noCache || !this.cachedFilterProps) this.setCachedFilterProps(derefMobx(filterProps));

      if (withFullCount) {
        const countRes = await trpc.getFilteredFileTransformCount.mutate({
          ...filterProps,
          curMaxPage: this.pageCount,
          page,
          pageSize: this.pageSize,
          withFull: withFullCount,
        });
        if (loadId !== this.loadId) return;
        if (!countRes.success) throw new Error(countRes.error);
        const pageCount = countRes.data.pageCount;

        this.setPageCount(pageCount);
        this.setIsPageCountLoading(false);
        if (debug) perfLog(`Set pageCount to ${pageCount}`);

        page = pageCount;
      }

      const newPage = page ?? this.page;
      this.setPage(newPage);
      if (debug && page) perfLog(`Set page to ${page ?? this.page}`);

      const itemsRes = await trpc.listFilteredFileTransform.mutate({
        ...filterProps,
        forcePages: this.forcePages,
        page: newPage,
        pageSize: this.pageSize,
      });
      if (loadId !== this.loadId) return;
      if (!itemsRes.success) throw new Error(itemsRes.error);

      let items = itemsRes.data;
      if (debug) perfLog(`Loaded ${items.length} items`);

      const results = items;

      this.setResults(results.map((result) => new Stores.FileTransform(result)));
      if (debug) perfLog("Overwrite and re-render");

      this.setIsLoading(false);
      if (noCache) this.setHasChanges(false);

      if (!withFullCount) {
        trpc.getFilteredFileTransformCount
          .mutate({
            ...filterProps,
            curMaxPage: this.pageCount,
            page,
            pageSize: this.pageSize,
            withFull: withFullCount,
          })
          .then((countRes) => {
            if (loadId !== this.loadId) return;
            this.setIsPageCountLoading(false);
            if (!countRes.success) return console.error(countRes.error);
            const pageCount = countRes.data.pageCount;

            this.setPageCount(pageCount);
            if (debug) perfLog(`Set pageCount to ${pageCount}`);
          });
      }

      return results;
    },
  );

  @modelFlow
  loadSavedSearches = asyncAction(async () => {
    const res = await trpc.listSavedSearch.mutate({
      args: {
        filter: { searchType: "FileTransform" },
        page: 1,
        pageSize: 1000,
        sort: { label: "asc" },
      },
    });
    if (!res.success) throw new Error(res.error);
    this.setSavedSearches(res.data.items.map((result) => new Stores.SavedSearch(result)));
    return res.data.items;
  });

  @modelFlow
  saveSavedSearch = asyncAction(async (label: string) => {
    const trimmedLabel = label.trim();
    if (!trimmedLabel) throw new Error("Saved search label is required");

    const existing = this.savedSearches.find((s) => s.label === trimmedLabel);
    const selected = this.savedSearches.find((s) => s.id === this.selectedSavedSearchId);
    const filterProps = this.getSearchProps();

    if (selected) {
      const res = await trpc.updateSavedSearch.mutate({
        args: { id: selected.id, updates: { filterProps, label: trimmedLabel } },
      });
      if (!res.success) throw new Error(res.error);
      await this.loadSavedSearches();
      this.setSelectedSavedSearchId(selected.id);
      this.setIsSaveModalOpen(false);
      toast.success("Saved search updated");
      return res.data;
    }

    if (existing) {
      const res = await trpc.updateSavedSearch.mutate({
        args: { id: existing.id, updates: { filterProps } },
      });
      if (!res.success) throw new Error(res.error);
      await this.loadSavedSearches();
      this.setSelectedSavedSearchId(existing.id);
      this.setIsSaveModalOpen(false);
      toast.success("Saved search updated");
      return res.data;
    }

    const res = await trpc.createSavedSearch.mutate({
      args: {
        dateCreated: dayjs().toISOString(),
        filterProps,
        label: trimmedLabel,
        searchType: "FileTransform",
      },
    });
    if (!res.success) throw new Error(res.error);

    await this.loadSavedSearches();
    this.setSelectedSavedSearchId(res.data.id);
    this.setIsSaveModalOpen(false);
    toast.success("Saved search created");
    return res.data;
  });

  /* GETTERS */
  @computed
  get numOfFilters() {
    return (
      (!isDeepEqual(this.afterSize, { logOp: "", value: 0 }) ? 1 : 0) +
      (!isDeepEqual(this.beforePath, null) ? 1 : 0) +
      (!isDeepEqual(this.beforeSize, { logOp: "", value: 0 }) ? 1 : 0) +
      (!isDeepEqual(this.completedAtEnd, "") ? 1 : 0) +
      (!isDeepEqual(this.completedAtStart, "") ? 1 : 0) +
      (!isDeepEqual(this.dateCreatedEnd, "") ? 1 : 0) +
      (!isDeepEqual(this.dateCreatedStart, "") ? 1 : 0) +
      (!isDeepEqual(this.ids, []) ? 1 : 0) +
      (!isDeepEqual(this.isCompleted, false) ? 1 : 0) +
      (!isDeepEqual(this.sortValue, getConfig().file.transforms.search.sort) ? 1 : 0) +
      (!isDeepEqual(this.startedAtEnd, "") ? 1 : 0) +
      (!isDeepEqual(this.startedAtStart, "") ? 1 : 0) +
      (!isDeepEqual(this.status, "") ? 1 : 0) +
      (!isDeepEqual(this.type, "") ? 1 : 0)
    );
  }

  /* DYNAMIC GETTERS */
  getCachedFilterProps() {
    if (!this.cachedFilterProps) this.setCachedFilterProps(derefMobx(this.getFilterProps()));
    return this.cachedFilterProps;
  }

  getFilterProps() {
    return {
      afterSize: this.afterSize,
      beforePath: this.beforePath,
      beforeSize: this.beforeSize,
      completedAtEnd: this.completedAtEnd,
      completedAtStart: this.completedAtStart,
      dateCreatedEnd: this.dateCreatedEnd,
      dateCreatedStart: this.dateCreatedStart,
      ids: this.ids,
      isCompleted: this.isCompleted,
      sortValue: this.sortValue,
      startedAtEnd: this.startedAtEnd,
      startedAtStart: this.startedAtStart,
      status: this.status,
      type: this.type,
    };
  }

  getIsSelected(id: string) {
    return !!this.selectedIds.find((s) => s === id);
  }

  getResult(id: string) {
    return this.results.find((r) => r.id === id);
  }
  getSearchProps() {
    return derefMobx({
      afterSize: this.afterSize,
      beforePath: this.beforePath,
      beforeSize: this.beforeSize,
      completedAtEnd: this.completedAtEnd,
      completedAtStart: this.completedAtStart,
      dateCreatedEnd: this.dateCreatedEnd,
      dateCreatedStart: this.dateCreatedStart,
      ids: this.ids,
      isCompleted: this.isCompleted,
      sortValue: this.sortValue,
      startedAtEnd: this.startedAtEnd,
      startedAtStart: this.startedAtStart,
      status: this.status,
      type: this.type,
    });
  }
}
@model("medior/_FileSearch")
export class _FileSearch extends Model({
  bitrate: prop<{ logOp: LogicalOp | ""; value: number }>(() => ({ logOp: "", value: 0 })),
  cachedFilterProps: prop<object | null>(null).withSetter(),
  dateCreatedEnd: prop<string>("").withSetter(),
  dateCreatedStart: prop<string>("").withSetter(),
  dateImportedEnd: prop<string>("").withSetter(),
  dateImportedStart: prop<string>("").withSetter(),
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
  loadId: prop<number>(0).withSetter(),
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
  isDeleteModalOpen: prop<boolean>(false).withSetter(),
  isSaveModalOpen: prop<boolean>(false).withSetter(),
  savedSearches: prop<Stores.SavedSearch[]>(() => []).withSetter(),
  selectedSavedSearchId: prop<string>("").withSetter(),
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
  applySearchProps(searchProps: Record<string, any>) {
    this.reset();
    Object.entries(searchProps).forEach(([key, value]) => {
      if (key in this) this[key] = value;
    });
    this.cachedFilterProps = null;
    this.hasChanges = true;
    this.page = 1;
    (this as any).afterApplySearchProps?.(searchProps);
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

  @modelAction
  _deleteResults(ids: string[]) {
    this.results = this.results.filter((d) => !ids.includes(d.id));
  }

  @modelAction
  reset() {
    this.bitrate = { logOp: "", value: 0 };
    this.cachedFilterProps = null;
    this.dateCreatedEnd = "";
    this.dateCreatedStart = "";
    this.dateImportedEnd = "";
    this.dateImportedStart = "";
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
    this.loadId = 0;
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

  /* ASYNC ACTIONS */
  @modelFlow
  applySavedSearch = asyncAction(async (id: string) => {
    if (!this.savedSearches.some((s) => s.id === id)) await this.loadSavedSearches();
    const savedSearch = this.savedSearches.find((s) => s.id === id);
    if (!savedSearch) return;

    this.applySearchProps(derefMobx(savedSearch.filterProps));
    this.setSelectedSavedSearchId(id);
    await this.loadFiltered({ noCache: true, page: 1 });
  });

  @modelFlow
  deleteSavedSearch = asyncAction(async (id: string = this.selectedSavedSearchId) => {
    if (!id) return;

    const res = await trpc.deleteSavedSearch.mutate({ args: { ids: [id] } });
    if (!res.success) throw new Error(res.error);

    await this.loadSavedSearches();
    if (this.selectedSavedSearchId === id) this.setSelectedSavedSearchId("");
    this.setIsDeleteModalOpen(false);
    toast.warn("Saved search deleted");
  });

  @modelFlow
  getShiftSelected = asyncAction(
    async ({ id, selectedIds }: { id: string; selectedIds: string[] }) => {
      const clickedLocalIndex = this.results.findIndex((r) => r.id === id);

      const selectedLocalIndexes = selectedIds
        .map((sid) => this.results.findIndex((r) => r.id === sid))
        .filter((i) => i > -1);

      const canResolveLocally =
        clickedLocalIndex > -1 &&
        selectedLocalIndexes.length === selectedIds.length &&
        this.results.length > 0;

      if (canResolveLocally) {
        const firstSelected = Math.min(...selectedLocalIndexes);
        const lastSelected = Math.max(...selectedLocalIndexes);
        if (firstSelected === clickedLocalIndex) return { idsToSelect: [], idsToDeselect: [id] };

        const isFirstAfterClicked = firstSelected > clickedLocalIndex;
        const start = isFirstAfterClicked ? clickedLocalIndex : firstSelected;
        const end = isFirstAfterClicked ? lastSelected : clickedLocalIndex;

        const newIds = this.results.slice(start, end + 1).map((r) => r.id);
        const idsToSelect = newIds.filter((i) => !selectedIds.includes(i));
        const idsToDeselect = selectedIds.filter((i) => !newIds.includes(i));

        return { idsToSelect, idsToDeselect };
      }

      const clickedIndex = (this.page - 1) * this.pageSize + clickedLocalIndex;

      this.setIsLoading(true);
      const res = await trpc.getShiftSelectedFile.mutate({
        ...this.cachedFilterProps,
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
  selectAllInQuery = asyncAction(async () => {
    const countRes = await trpc.getFilteredFileCount.mutate({
      ...this.getFilterProps(),
      curMaxPage: this.pageCount,
      page: this.page,
      pageSize: this.pageSize,
      withFull: true,
    });
    if (!countRes.success) throw new Error(countRes.error);
    if (countRes.data.count === 0) return 0;

    const res = await trpc.listFilteredFile.mutate({
      ...this.getFilterProps(),
      page: 1,
      pageSize: countRes.data.count,
      select: { _id: 1 },
    });
    if (!res.success) throw new Error(res.error);

    this.toggleSelected(res.data.map(({ id }) => ({ id, isSelected: true })));
    return res.data.length;
  });

  @modelFlow
  loadFiltered = asyncAction(
    async ({
      noCache,
      page,
      withFullCount,
    }: { noCache?: boolean; page?: number; withFullCount?: boolean } = {}) => {
      const debug = false;
      const { perfLog } = makePerfLog("[FileSearch]");
      const loadId = this.loadId + 1;
      this.setLoadId(loadId);
      this.setIsLoading(true);
      this.setIsPageCountLoading(true);

      const filterProps = noCache ? this.getFilterProps() : this.getCachedFilterProps();
      if (noCache || !this.cachedFilterProps) this.setCachedFilterProps(derefMobx(filterProps));

      if (withFullCount) {
        const countRes = await trpc.getFilteredFileCount.mutate({
          ...filterProps,
          curMaxPage: this.pageCount,
          page,
          pageSize: this.pageSize,
          withFull: withFullCount,
        });
        if (loadId !== this.loadId) return;
        if (!countRes.success) throw new Error(countRes.error);
        const pageCount = countRes.data.pageCount;

        this.setPageCount(pageCount);
        this.setIsPageCountLoading(false);
        if (debug) perfLog(`Set pageCount to ${pageCount}`);

        page = pageCount;
      }

      const newPage = page ?? this.page;
      this.setPage(newPage);
      if (debug && page) perfLog(`Set page to ${page ?? this.page}`);

      const itemsRes = await trpc.listFilteredFile.mutate({
        ...filterProps,
        forcePages: this.forcePages,
        page: newPage,
        pageSize: this.pageSize,
      });
      if (loadId !== this.loadId) return;
      if (!itemsRes.success) throw new Error(itemsRes.error);

      let items = itemsRes.data;
      if (debug) perfLog(`Loaded ${items.length} items`);

      const tagIds = [...new Set(items.flatMap((item) => item.tagIdsWithAncestors))];
      const tags = (await trpc.listTag.mutate({ filter: { id: tagIds } })).data;

      if (loadId !== this.loadId) return;

      items = await Promise.all(
        items.map(async (item) => ({
          ...item,
          tags: tags.filter((t) => item.tagIds.includes(t.id)),
        })),
      );

      const results = items;

      this.setResults(results.map((result) => new Stores.File(result)));
      if (debug) perfLog("Overwrite and re-render");

      this.setIsLoading(false);
      if (noCache) this.setHasChanges(false);

      if (!withFullCount) {
        trpc.getFilteredFileCount
          .mutate({
            ...filterProps,
            curMaxPage: this.pageCount,
            page,
            pageSize: this.pageSize,
            withFull: withFullCount,
          })
          .then((countRes) => {
            if (loadId !== this.loadId) return;
            this.setIsPageCountLoading(false);
            if (!countRes.success) return console.error(countRes.error);
            const pageCount = countRes.data.pageCount;

            this.setPageCount(pageCount);
            if (debug) perfLog(`Set pageCount to ${pageCount}`);
          });
      }

      return results;
    },
  );

  @modelFlow
  loadSavedSearches = asyncAction(async () => {
    const res = await trpc.listSavedSearch.mutate({
      args: {
        filter: { searchType: "File" },
        page: 1,
        pageSize: 1000,
        sort: { label: "asc" },
      },
    });
    if (!res.success) throw new Error(res.error);
    this.setSavedSearches(res.data.items.map((result) => new Stores.SavedSearch(result)));
    return res.data.items;
  });

  @modelFlow
  saveSavedSearch = asyncAction(async (label: string) => {
    const trimmedLabel = label.trim();
    if (!trimmedLabel) throw new Error("Saved search label is required");

    const existing = this.savedSearches.find((s) => s.label === trimmedLabel);
    const selected = this.savedSearches.find((s) => s.id === this.selectedSavedSearchId);
    const filterProps = this.getSearchProps();

    if (selected) {
      const res = await trpc.updateSavedSearch.mutate({
        args: { id: selected.id, updates: { filterProps, label: trimmedLabel } },
      });
      if (!res.success) throw new Error(res.error);
      await this.loadSavedSearches();
      this.setSelectedSavedSearchId(selected.id);
      this.setIsSaveModalOpen(false);
      toast.success("Saved search updated");
      return res.data;
    }

    if (existing) {
      const res = await trpc.updateSavedSearch.mutate({
        args: { id: existing.id, updates: { filterProps } },
      });
      if (!res.success) throw new Error(res.error);
      await this.loadSavedSearches();
      this.setSelectedSavedSearchId(existing.id);
      this.setIsSaveModalOpen(false);
      toast.success("Saved search updated");
      return res.data;
    }

    const res = await trpc.createSavedSearch.mutate({
      args: {
        dateCreated: dayjs().toISOString(),
        filterProps,
        label: trimmedLabel,
        searchType: "File",
      },
    });
    if (!res.success) throw new Error(res.error);

    await this.loadSavedSearches();
    this.setSelectedSavedSearchId(res.data.id);
    this.setIsSaveModalOpen(false);
    toast.success("Saved search created");
    return res.data;
  });

  /* GETTERS */
  @computed
  get numOfFilters() {
    return (
      (!isDeepEqual(this.bitrate, { logOp: "", value: 0 }) ? 1 : 0) +
      (!isDeepEqual(this.dateCreatedEnd, "") ? 1 : 0) +
      (!isDeepEqual(this.dateCreatedStart, "") ? 1 : 0) +
      (!isDeepEqual(this.dateImportedEnd, "") ? 1 : 0) +
      (!isDeepEqual(this.dateImportedStart, "") ? 1 : 0) +
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
  getCachedFilterProps() {
    if (!this.cachedFilterProps) this.setCachedFilterProps(derefMobx(this.getFilterProps()));
    return this.cachedFilterProps;
  }

  getFilterProps() {
    return {
      bitrate: this.bitrate,
      dateCreatedEnd: this.dateCreatedEnd,
      dateCreatedStart: this.dateCreatedStart,
      dateImportedEnd: this.dateImportedEnd,
      dateImportedStart: this.dateImportedStart,
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
  getSearchProps() {
    return derefMobx({
      bitrate: this.bitrate,
      dateCreatedEnd: this.dateCreatedEnd,
      dateCreatedStart: this.dateCreatedStart,
      dateImportedEnd: this.dateImportedEnd,
      dateImportedStart: this.dateImportedStart,
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
      tags: this.tags,
    });
  }
}
@model("medior/_SavedImportConfigSearch")
export class _SavedImportConfigSearch extends Model({
  cachedFilterProps: prop<object | null>(null).withSetter(),
  dateModifiedEnd: prop<string>("").withSetter(),
  dateModifiedStart: prop<string>("").withSetter(),
  folderPath: prop<string>(""),
  forcePages: prop<boolean>(false).withSetter(),
  hasChanges: prop<boolean>(false).withSetter(),
  ids: prop<string[]>(() => []).withSetter(),
  isLoading: prop<boolean>(false).withSetter(),
  isPageCountLoading: prop<boolean>(false).withSetter(),
  label: prop<string>(""),
  loadId: prop<number>(0).withSetter(),
  page: prop<number>(1).withSetter(),
  pageCount: prop<number>(1).withSetter(),
  pageSize: prop<number>(20).withSetter(),
  results: prop<Stores.SavedImportConfig[]>(() => []).withSetter(),
  selectedIds: prop<string[]>(() => []).withSetter(),
  sortValue: prop<SortMenuProps["value"]>(() => ({
    isDesc: true,
    key: "dateModified",
  })).withSetter(),
  isDeleteModalOpen: prop<boolean>(false).withSetter(),
  isSaveModalOpen: prop<boolean>(false).withSetter(),
  savedSearches: prop<Stores.SavedSearch[]>(() => []).withSetter(),
  selectedSavedSearchId: prop<string>("").withSetter(),
}) {
  onInit() {
    autoBind(this);
  }

  /* STANDARD ACTIONS */
  @modelAction
  _addResult(result: ModelCreationData<Stores.SavedImportConfig>) {
    this.results.push(new Stores.SavedImportConfig(result));
  }

  @modelAction
  applySearchProps(searchProps: Record<string, any>) {
    this.reset();
    Object.entries(searchProps).forEach(([key, value]) => {
      if (key in this) this[key] = value;
    });
    this.cachedFilterProps = null;
    this.hasChanges = true;
    this.page = 1;
    (this as any).afterApplySearchProps?.(searchProps);
  }

  @modelAction
  setFolderPath(value: string) {
    this.folderPath = value;
    this.hasChanges = true;
  }

  @modelAction
  setLabel(value: string) {
    this.label = value;
    this.hasChanges = true;
  }

  @modelAction
  _deleteResults(ids: string[]) {
    this.results = this.results.filter((d) => !ids.includes(d.id));
  }

  @modelAction
  reset() {
    this.cachedFilterProps = null;
    this.dateModifiedEnd = "";
    this.dateModifiedStart = "";
    this.folderPath = "";
    this.forcePages = false;
    this.hasChanges = false;
    this.ids = [];
    this.isLoading = false;
    this.isPageCountLoading = false;
    this.label = "";
    this.loadId = 0;
    this.page = 1;
    this.pageCount = 1;
    this.pageSize = 20;
    this.results = [];
    this.selectedIds = [];
    this.sortValue = { isDesc: true, key: "dateModified" };
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

  /* ASYNC ACTIONS */
  @modelFlow
  applySavedSearch = asyncAction(async (id: string) => {
    if (!this.savedSearches.some((s) => s.id === id)) await this.loadSavedSearches();
    const savedSearch = this.savedSearches.find((s) => s.id === id);
    if (!savedSearch) return;

    this.applySearchProps(derefMobx(savedSearch.filterProps));
    this.setSelectedSavedSearchId(id);
    await this.loadFiltered({ noCache: true, page: 1 });
  });

  @modelFlow
  deleteSavedSearch = asyncAction(async (id: string = this.selectedSavedSearchId) => {
    if (!id) return;

    const res = await trpc.deleteSavedSearch.mutate({ args: { ids: [id] } });
    if (!res.success) throw new Error(res.error);

    await this.loadSavedSearches();
    if (this.selectedSavedSearchId === id) this.setSelectedSavedSearchId("");
    this.setIsDeleteModalOpen(false);
    toast.warn("Saved search deleted");
  });

  @modelFlow
  getShiftSelected = asyncAction(
    async ({ id, selectedIds }: { id: string; selectedIds: string[] }) => {
      const clickedLocalIndex = this.results.findIndex((r) => r.id === id);

      const selectedLocalIndexes = selectedIds
        .map((sid) => this.results.findIndex((r) => r.id === sid))
        .filter((i) => i > -1);

      const canResolveLocally =
        clickedLocalIndex > -1 &&
        selectedLocalIndexes.length === selectedIds.length &&
        this.results.length > 0;

      if (canResolveLocally) {
        const firstSelected = Math.min(...selectedLocalIndexes);
        const lastSelected = Math.max(...selectedLocalIndexes);
        if (firstSelected === clickedLocalIndex) return { idsToSelect: [], idsToDeselect: [id] };

        const isFirstAfterClicked = firstSelected > clickedLocalIndex;
        const start = isFirstAfterClicked ? clickedLocalIndex : firstSelected;
        const end = isFirstAfterClicked ? lastSelected : clickedLocalIndex;

        const newIds = this.results.slice(start, end + 1).map((r) => r.id);
        const idsToSelect = newIds.filter((i) => !selectedIds.includes(i));
        const idsToDeselect = selectedIds.filter((i) => !newIds.includes(i));

        return { idsToSelect, idsToDeselect };
      }

      const clickedIndex = (this.page - 1) * this.pageSize + clickedLocalIndex;

      this.setIsLoading(true);
      const res = await trpc.getShiftSelectedSavedImportConfig.mutate({
        ...this.cachedFilterProps,
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
  selectAllInQuery = asyncAction(async () => {
    const countRes = await trpc.getFilteredSavedImportConfigCount.mutate({
      ...this.getFilterProps(),
      curMaxPage: this.pageCount,
      page: this.page,
      pageSize: this.pageSize,
      withFull: true,
    });
    if (!countRes.success) throw new Error(countRes.error);
    if (countRes.data.count === 0) return 0;

    const res = await trpc.listFilteredSavedImportConfig.mutate({
      ...this.getFilterProps(),
      page: 1,
      pageSize: countRes.data.count,
      select: { _id: 1 },
    });
    if (!res.success) throw new Error(res.error);

    this.toggleSelected(res.data.map(({ id }) => ({ id, isSelected: true })));
    return res.data.length;
  });

  @modelFlow
  loadFiltered = asyncAction(
    async ({
      noCache,
      page,
      withFullCount,
    }: { noCache?: boolean; page?: number; withFullCount?: boolean } = {}) => {
      const debug = false;
      const { perfLog } = makePerfLog("[SavedImportConfigSearch]");
      const loadId = this.loadId + 1;
      this.setLoadId(loadId);
      this.setIsLoading(true);
      this.setIsPageCountLoading(true);

      const filterProps = noCache ? this.getFilterProps() : this.getCachedFilterProps();
      if (noCache || !this.cachedFilterProps) this.setCachedFilterProps(derefMobx(filterProps));

      if (withFullCount) {
        const countRes = await trpc.getFilteredSavedImportConfigCount.mutate({
          ...filterProps,
          curMaxPage: this.pageCount,
          page,
          pageSize: this.pageSize,
          withFull: withFullCount,
        });
        if (loadId !== this.loadId) return;
        if (!countRes.success) throw new Error(countRes.error);
        const pageCount = countRes.data.pageCount;

        this.setPageCount(pageCount);
        this.setIsPageCountLoading(false);
        if (debug) perfLog(`Set pageCount to ${pageCount}`);

        page = pageCount;
      }

      const newPage = page ?? this.page;
      this.setPage(newPage);
      if (debug && page) perfLog(`Set page to ${page ?? this.page}`);

      const itemsRes = await trpc.listFilteredSavedImportConfig.mutate({
        ...filterProps,
        forcePages: this.forcePages,
        page: newPage,
        pageSize: this.pageSize,
      });
      if (loadId !== this.loadId) return;
      if (!itemsRes.success) throw new Error(itemsRes.error);

      let items = itemsRes.data;
      if (debug) perfLog(`Loaded ${items.length} items`);

      const results = items;

      this.setResults(results.map((result) => new Stores.SavedImportConfig(result)));
      if (debug) perfLog("Overwrite and re-render");

      this.setIsLoading(false);
      if (noCache) this.setHasChanges(false);

      if (!withFullCount) {
        trpc.getFilteredSavedImportConfigCount
          .mutate({
            ...filterProps,
            curMaxPage: this.pageCount,
            page,
            pageSize: this.pageSize,
            withFull: withFullCount,
          })
          .then((countRes) => {
            if (loadId !== this.loadId) return;
            this.setIsPageCountLoading(false);
            if (!countRes.success) return console.error(countRes.error);
            const pageCount = countRes.data.pageCount;

            this.setPageCount(pageCount);
            if (debug) perfLog(`Set pageCount to ${pageCount}`);
          });
      }

      return results;
    },
  );

  @modelFlow
  loadSavedSearches = asyncAction(async () => {
    const res = await trpc.listSavedSearch.mutate({
      args: {
        filter: { searchType: "SavedImportConfig" },
        page: 1,
        pageSize: 1000,
        sort: { label: "asc" },
      },
    });
    if (!res.success) throw new Error(res.error);
    this.setSavedSearches(res.data.items.map((result) => new Stores.SavedSearch(result)));
    return res.data.items;
  });

  @modelFlow
  saveSavedSearch = asyncAction(async (label: string) => {
    const trimmedLabel = label.trim();
    if (!trimmedLabel) throw new Error("Saved search label is required");

    const existing = this.savedSearches.find((s) => s.label === trimmedLabel);
    const selected = this.savedSearches.find((s) => s.id === this.selectedSavedSearchId);
    const filterProps = this.getSearchProps();

    if (selected) {
      const res = await trpc.updateSavedSearch.mutate({
        args: { id: selected.id, updates: { filterProps, label: trimmedLabel } },
      });
      if (!res.success) throw new Error(res.error);
      await this.loadSavedSearches();
      this.setSelectedSavedSearchId(selected.id);
      this.setIsSaveModalOpen(false);
      toast.success("Saved search updated");
      return res.data;
    }

    if (existing) {
      const res = await trpc.updateSavedSearch.mutate({
        args: { id: existing.id, updates: { filterProps } },
      });
      if (!res.success) throw new Error(res.error);
      await this.loadSavedSearches();
      this.setSelectedSavedSearchId(existing.id);
      this.setIsSaveModalOpen(false);
      toast.success("Saved search updated");
      return res.data;
    }

    const res = await trpc.createSavedSearch.mutate({
      args: {
        dateCreated: dayjs().toISOString(),
        filterProps,
        label: trimmedLabel,
        searchType: "SavedImportConfig",
      },
    });
    if (!res.success) throw new Error(res.error);

    await this.loadSavedSearches();
    this.setSelectedSavedSearchId(res.data.id);
    this.setIsSaveModalOpen(false);
    toast.success("Saved search created");
    return res.data;
  });

  /* GETTERS */
  @computed
  get numOfFilters() {
    return (
      (!isDeepEqual(this.dateModifiedEnd, "") ? 1 : 0) +
      (!isDeepEqual(this.dateModifiedStart, "") ? 1 : 0) +
      (!isDeepEqual(this.folderPath, "") ? 1 : 0) +
      (!isDeepEqual(this.ids, []) ? 1 : 0) +
      (!isDeepEqual(this.label, "") ? 1 : 0) +
      (!isDeepEqual(this.sortValue, { isDesc: true, key: "dateModified" }) ? 1 : 0)
    );
  }

  /* DYNAMIC GETTERS */
  getCachedFilterProps() {
    if (!this.cachedFilterProps) this.setCachedFilterProps(derefMobx(this.getFilterProps()));
    return this.cachedFilterProps;
  }

  getFilterProps() {
    return {
      dateModifiedEnd: this.dateModifiedEnd,
      dateModifiedStart: this.dateModifiedStart,
      folderPath: this.folderPath,
      ids: this.ids,
      label: this.label,
      sortValue: this.sortValue,
    };
  }

  getIsSelected(id: string) {
    return !!this.selectedIds.find((s) => s === id);
  }

  getResult(id: string) {
    return this.results.find((r) => r.id === id);
  }
  getSearchProps() {
    return derefMobx({
      dateModifiedEnd: this.dateModifiedEnd,
      dateModifiedStart: this.dateModifiedStart,
      folderPath: this.folderPath,
      ids: this.ids,
      label: this.label,
      sortValue: this.sortValue,
    });
  }
}
@model("medior/_TagSearch")
export class _TagSearch extends Model({
  alias: prop<string>("").withSetter(),
  cachedFilterProps: prop<object | null>(null).withSetter(),
  count: prop<{ logOp: LogicalOp | ""; value: number }>(() => ({ logOp: "", value: 0 })),
  dateCreatedEnd: prop<string>("").withSetter(),
  dateCreatedStart: prop<string>("").withSetter(),
  dateModifiedEnd: prop<string>("").withSetter(),
  dateModifiedStart: prop<string>("").withSetter(),
  dateOfInceptionEnd: prop<string>("").withSetter(),
  dateOfInceptionStart: prop<string>("").withSetter(),
  forcePages: prop<boolean>(false).withSetter(),
  hasChanges: prop<boolean>(false).withSetter(),
  hasRegEx: prop<boolean>(null).withSetter(),
  ids: prop<string[]>(() => []).withSetter(),
  isLoading: prop<boolean>(false).withSetter(),
  isPageCountLoading: prop<boolean>(false).withSetter(),
  label: prop<string>("").withSetter(),
  loadId: prop<number>(0).withSetter(),
  page: prop<number>(1).withSetter(),
  pageCount: prop<number>(1).withSetter(),
  pageSize: prop<number>(() => getConfig().tags.manager.search.pageSize).withSetter(),
  rating: prop<{ logOp: LogicalOp | ""; value: number }>(() => ({ logOp: "", value: 0 })),
  results: prop<Stores.Tag[]>(() => []).withSetter(),
  selectedIds: prop<string[]>(() => []).withSetter(),
  size: prop<{ logOp: LogicalOp | ""; value: number }>(() => ({ logOp: "", value: 0 })),
  sortValue: prop<SortMenuProps["value"]>(() => getConfig().tags.manager.search.sort).withSetter(),
  tags: prop<Stores.TagOption[]>(() => []).withSetter(),
  title: prop<string>("").withSetter(),
  isDeleteModalOpen: prop<boolean>(false).withSetter(),
  isSaveModalOpen: prop<boolean>(false).withSetter(),
  savedSearches: prop<Stores.SavedSearch[]>(() => []).withSetter(),
  selectedSavedSearchId: prop<string>("").withSetter(),
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
  applySearchProps(searchProps: Record<string, any>) {
    this.reset();
    Object.entries(searchProps).forEach(([key, value]) => {
      if (key in this) this[key] = value;
    });
    this.cachedFilterProps = null;
    this.hasChanges = true;
    this.page = 1;
    (this as any).afterApplySearchProps?.(searchProps);
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
  setSizeOp(val: LogicalOp | "") {
    this.size.logOp = val;
    if (val === "") this.size.value = 0;
  }

  @modelAction
  setSizeValue(val: number) {
    this.size.value = val;
  }

  @modelAction
  _deleteResults(ids: string[]) {
    this.results = this.results.filter((d) => !ids.includes(d.id));
  }

  @modelAction
  reset() {
    this.alias = "";
    this.cachedFilterProps = null;
    this.count = { logOp: "", value: 0 };
    this.dateCreatedEnd = "";
    this.dateCreatedStart = "";
    this.dateModifiedEnd = "";
    this.dateModifiedStart = "";
    this.dateOfInceptionEnd = "";
    this.dateOfInceptionStart = "";
    this.forcePages = false;
    this.hasChanges = false;
    this.hasRegEx = null;
    this.ids = [];
    this.isLoading = false;
    this.isPageCountLoading = false;
    this.label = "";
    this.loadId = 0;
    this.page = 1;
    this.pageCount = 1;
    this.pageSize = getConfig().tags.manager.search.pageSize;
    this.rating = { logOp: "", value: 0 };
    this.results = [];
    this.selectedIds = [];
    this.size = { logOp: "", value: 0 };
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

  /* ASYNC ACTIONS */
  @modelFlow
  applySavedSearch = asyncAction(async (id: string) => {
    if (!this.savedSearches.some((s) => s.id === id)) await this.loadSavedSearches();
    const savedSearch = this.savedSearches.find((s) => s.id === id);
    if (!savedSearch) return;

    this.applySearchProps(derefMobx(savedSearch.filterProps));
    this.setSelectedSavedSearchId(id);
    await this.loadFiltered({ noCache: true, page: 1 });
  });

  @modelFlow
  deleteSavedSearch = asyncAction(async (id: string = this.selectedSavedSearchId) => {
    if (!id) return;

    const res = await trpc.deleteSavedSearch.mutate({ args: { ids: [id] } });
    if (!res.success) throw new Error(res.error);

    await this.loadSavedSearches();
    if (this.selectedSavedSearchId === id) this.setSelectedSavedSearchId("");
    this.setIsDeleteModalOpen(false);
    toast.warn("Saved search deleted");
  });

  @modelFlow
  getShiftSelected = asyncAction(
    async ({ id, selectedIds }: { id: string; selectedIds: string[] }) => {
      const clickedLocalIndex = this.results.findIndex((r) => r.id === id);

      const selectedLocalIndexes = selectedIds
        .map((sid) => this.results.findIndex((r) => r.id === sid))
        .filter((i) => i > -1);

      const canResolveLocally =
        clickedLocalIndex > -1 &&
        selectedLocalIndexes.length === selectedIds.length &&
        this.results.length > 0;

      if (canResolveLocally) {
        const firstSelected = Math.min(...selectedLocalIndexes);
        const lastSelected = Math.max(...selectedLocalIndexes);
        if (firstSelected === clickedLocalIndex) return { idsToSelect: [], idsToDeselect: [id] };

        const isFirstAfterClicked = firstSelected > clickedLocalIndex;
        const start = isFirstAfterClicked ? clickedLocalIndex : firstSelected;
        const end = isFirstAfterClicked ? lastSelected : clickedLocalIndex;

        const newIds = this.results.slice(start, end + 1).map((r) => r.id);
        const idsToSelect = newIds.filter((i) => !selectedIds.includes(i));
        const idsToDeselect = selectedIds.filter((i) => !newIds.includes(i));

        return { idsToSelect, idsToDeselect };
      }

      const clickedIndex = (this.page - 1) * this.pageSize + clickedLocalIndex;

      this.setIsLoading(true);
      const res = await trpc.getShiftSelectedTag.mutate({
        ...this.cachedFilterProps,
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
  selectAllInQuery = asyncAction(async () => {
    const countRes = await trpc.getFilteredTagCount.mutate({
      ...this.getFilterProps(),
      curMaxPage: this.pageCount,
      page: this.page,
      pageSize: this.pageSize,
      withFull: true,
    });
    if (!countRes.success) throw new Error(countRes.error);
    if (countRes.data.count === 0) return 0;

    const res = await trpc.listFilteredTag.mutate({
      ...this.getFilterProps(),
      page: 1,
      pageSize: countRes.data.count,
      select: { _id: 1 },
    });
    if (!res.success) throw new Error(res.error);

    this.toggleSelected(res.data.map(({ id }) => ({ id, isSelected: true })));
    return res.data.length;
  });

  @modelFlow
  loadFiltered = asyncAction(
    async ({
      noCache,
      page,
      withFullCount,
    }: { noCache?: boolean; page?: number; withFullCount?: boolean } = {}) => {
      const debug = false;
      const { perfLog } = makePerfLog("[TagSearch]");
      const loadId = this.loadId + 1;
      this.setLoadId(loadId);
      this.setIsLoading(true);
      this.setIsPageCountLoading(true);

      const filterProps = noCache ? this.getFilterProps() : this.getCachedFilterProps();
      if (noCache || !this.cachedFilterProps) this.setCachedFilterProps(derefMobx(filterProps));

      if (withFullCount) {
        const countRes = await trpc.getFilteredTagCount.mutate({
          ...filterProps,
          curMaxPage: this.pageCount,
          page,
          pageSize: this.pageSize,
          withFull: withFullCount,
        });
        if (loadId !== this.loadId) return;
        if (!countRes.success) throw new Error(countRes.error);
        const pageCount = countRes.data.pageCount;

        this.setPageCount(pageCount);
        this.setIsPageCountLoading(false);
        if (debug) perfLog(`Set pageCount to ${pageCount}`);

        page = pageCount;
      }

      const newPage = page ?? this.page;
      this.setPage(newPage);
      if (debug && page) perfLog(`Set page to ${page ?? this.page}`);

      const itemsRes = await trpc.listFilteredTag.mutate({
        ...filterProps,
        forcePages: this.forcePages,
        page: newPage,
        pageSize: this.pageSize,
      });
      if (loadId !== this.loadId) return;
      if (!itemsRes.success) throw new Error(itemsRes.error);

      let items = itemsRes.data;
      if (debug) perfLog(`Loaded ${items.length} items`);

      const results = await trpc.deriveTagCategories.mutate(items);

      this.setResults(results.map((result) => new Stores.Tag(result)));
      if (debug) perfLog("Overwrite and re-render");

      this.setIsLoading(false);
      if (noCache) this.setHasChanges(false);

      if (!withFullCount) {
        trpc.getFilteredTagCount
          .mutate({
            ...filterProps,
            curMaxPage: this.pageCount,
            page,
            pageSize: this.pageSize,
            withFull: withFullCount,
          })
          .then((countRes) => {
            if (loadId !== this.loadId) return;
            this.setIsPageCountLoading(false);
            if (!countRes.success) return console.error(countRes.error);
            const pageCount = countRes.data.pageCount;

            this.setPageCount(pageCount);
            if (debug) perfLog(`Set pageCount to ${pageCount}`);
          });
      }

      return results;
    },
  );

  @modelFlow
  loadSavedSearches = asyncAction(async () => {
    const res = await trpc.listSavedSearch.mutate({
      args: {
        filter: { searchType: "Tag" },
        page: 1,
        pageSize: 1000,
        sort: { label: "asc" },
      },
    });
    if (!res.success) throw new Error(res.error);
    this.setSavedSearches(res.data.items.map((result) => new Stores.SavedSearch(result)));
    return res.data.items;
  });

  @modelFlow
  saveSavedSearch = asyncAction(async (label: string) => {
    const trimmedLabel = label.trim();
    if (!trimmedLabel) throw new Error("Saved search label is required");

    const existing = this.savedSearches.find((s) => s.label === trimmedLabel);
    const selected = this.savedSearches.find((s) => s.id === this.selectedSavedSearchId);
    const filterProps = this.getSearchProps();

    if (selected) {
      const res = await trpc.updateSavedSearch.mutate({
        args: { id: selected.id, updates: { filterProps, label: trimmedLabel } },
      });
      if (!res.success) throw new Error(res.error);
      await this.loadSavedSearches();
      this.setSelectedSavedSearchId(selected.id);
      this.setIsSaveModalOpen(false);
      toast.success("Saved search updated");
      return res.data;
    }

    if (existing) {
      const res = await trpc.updateSavedSearch.mutate({
        args: { id: existing.id, updates: { filterProps } },
      });
      if (!res.success) throw new Error(res.error);
      await this.loadSavedSearches();
      this.setSelectedSavedSearchId(existing.id);
      this.setIsSaveModalOpen(false);
      toast.success("Saved search updated");
      return res.data;
    }

    const res = await trpc.createSavedSearch.mutate({
      args: {
        dateCreated: dayjs().toISOString(),
        filterProps,
        label: trimmedLabel,
        searchType: "Tag",
      },
    });
    if (!res.success) throw new Error(res.error);

    await this.loadSavedSearches();
    this.setSelectedSavedSearchId(res.data.id);
    this.setIsSaveModalOpen(false);
    toast.success("Saved search created");
    return res.data;
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
      (!isDeepEqual(this.dateOfInceptionEnd, "") ? 1 : 0) +
      (!isDeepEqual(this.dateOfInceptionStart, "") ? 1 : 0) +
      (!isDeepEqual(this.hasRegEx, null) ? 1 : 0) +
      (!isDeepEqual(this.ids, []) ? 1 : 0) +
      (!isDeepEqual(this.label, "") ? 1 : 0) +
      (!isDeepEqual(this.rating, { logOp: "", value: 0 }) ? 1 : 0) +
      (!isDeepEqual(this.size, { logOp: "", value: 0 }) ? 1 : 0) +
      (!isDeepEqual(this.sortValue, getConfig().tags.manager.search.sort) ? 1 : 0) +
      (!isDeepEqual(this.tags, []) ? 1 : 0) +
      (!isDeepEqual(this.title, "") ? 1 : 0)
    );
  }

  /* DYNAMIC GETTERS */
  getCachedFilterProps() {
    if (!this.cachedFilterProps) this.setCachedFilterProps(derefMobx(this.getFilterProps()));
    return this.cachedFilterProps;
  }

  getFilterProps() {
    return {
      alias: this.alias,
      count: this.count,
      dateCreatedEnd: this.dateCreatedEnd,
      dateCreatedStart: this.dateCreatedStart,
      dateModifiedEnd: this.dateModifiedEnd,
      dateModifiedStart: this.dateModifiedStart,
      dateOfInceptionEnd: this.dateOfInceptionEnd,
      dateOfInceptionStart: this.dateOfInceptionStart,
      hasRegEx: this.hasRegEx,
      ids: this.ids,
      label: this.label,
      rating: this.rating,
      size: this.size,
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
  getSearchProps() {
    return derefMobx({
      alias: this.alias,
      count: this.count,
      dateCreatedEnd: this.dateCreatedEnd,
      dateCreatedStart: this.dateCreatedStart,
      dateModifiedEnd: this.dateModifiedEnd,
      dateModifiedStart: this.dateModifiedStart,
      dateOfInceptionEnd: this.dateOfInceptionEnd,
      dateOfInceptionStart: this.dateOfInceptionStart,
      hasRegEx: this.hasRegEx,
      ids: this.ids,
      label: this.label,
      rating: this.rating,
      size: this.size,
      sortValue: this.sortValue,
      tags: this.tags,
      title: this.title,
    });
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
  dateCreated: prop<string>(),
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
  ratingIsManual: prop<boolean>(null),
  size: prop<number>(),
  tagIds: prop<string[]>(() => []),
  tagIdsWithAncestors: prop<string[]>(() => []),
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
/*                               FileTransform
/* --------------------------------------------------------------------------- */

@model("medior/_FileTransform")
export class _FileTransform extends Model({
  id: prop<string>(),
  dateCreated: prop<string>(() => dayjs().toISOString()),
  afterAudioBitrate: prop<number>(null),
  afterAudioCodec: prop<string>(null),
  afterBitrate: prop<number>(null),
  afterDuration: prop<number>(null),
  afterFrameRate: prop<number>(null),
  afterHash: prop<string>(null),
  afterHeight: prop<number>(null),
  afterPath: prop<string>(null),
  afterSize: prop<number>(null),
  afterExt: prop<string>(null),
  afterVideoCodec: prop<string>(null),
  afterWidth: prop<number>(null),
  beforeAudioBitrate: prop<number>(null),
  beforeAudioCodec: prop<string>(null),
  beforeBitrate: prop<number>(null),
  beforeDuration: prop<number>(null),
  beforeFrameRate: prop<number>(null),
  beforeHash: prop<string>(null),
  beforeHeight: prop<number>(null),
  beforePath: prop<string>(),
  beforeSize: prop<number>(),
  beforeExt: prop<string>(),
  beforeVideoCodec: prop<string>(null),
  beforeWidth: prop<number>(null),
  completedAt: prop<string>(null),
  configCodec: prop<string>(null),
  configImageExt: prop<string>(null),
  configImageMaxHeight: prop<number>(null),
  configImageMaxWidth: prop<number>(null),
  configMaxBitrate: prop<number>(null),
  configMaxFps: prop<number>(null),
  configMaxHeight: prop<number>(null),
  configMaxWidth: prop<number>(null),
  configOverride: prop<string[]>(() => []),
  errorMsg: prop<string>(null),
  fileId: prop<string>(),
  isCompleted: prop<boolean>(false),
  progressPercent: prop<number>(null),
  progressSize: prop<number>(null),
  progressTime: prop<string>(null),
  startedAt: prop<string>(null),
  status: prop<
    | string
    | "COMPLETE"
    | "COMPRESSED"
    | "ERROR"
    | "PENDING"
    | "REPLACED"
    | "RUNNING"
    | "SAVED"
    | "SKIPPED"
  >(),
  timestampPairs: prop<Array<{ end: number; start: number }>>(() => []),
  type: prop<string | "reencode" | "remux" | "splice">(),
}) {
  @modelAction
  update(updates: Partial<ModelCreationData<this>>) {
    applySnapshot(this, { ...getSnapshot(this), ...updates });
  }
}

@model("medior/_FileTransformStore")
export class _FileTransformStore extends Model({ isLoading: prop<boolean>(false).withSetter() }) {
  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  createFileTransform = asyncAction(async (args: Types.CreateFileTransformInput) => {
    this.setIsLoading(true);
    const res = await trpc.createFileTransform.mutate({ args });
    this.setIsLoading(false);
    if (res.error) throw new Error(res.error);
    return res.data;
  });

  @modelFlow
  deleteFileTransform = asyncAction(async (args: Types.DeleteFileTransformInput) => {
    this.setIsLoading(true);
    const res = await trpc.deleteFileTransform.mutate({ args });
    this.setIsLoading(false);
    if (res.error) throw new Error(res.error);
    return res.data;
  });

  @modelFlow
  updateFileTransform = asyncAction(async (args: Types.UpdateFileTransformInput) => {
    this.setIsLoading(true);
    const res = await trpc.updateFileTransform.mutate({ args });
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
  dateImported: prop<string>(),
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
  timestamps: prop<
    Array<{
      id: string;
      label: string;
      pairs: Array<{
        endDuration: string;
        id: string;
        order: number;
        startDuration: string;
      }>;
    }>
  >(null),
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
/*                               SavedImportConfig
/* --------------------------------------------------------------------------- */

@model("medior/_SavedImportConfig")
export class _SavedImportConfig extends Model({
  id: prop<string>(),
  dateCreated: prop<string>(() => dayjs().toISOString()),
  dateModified: prop<string>(null),
  folderPath: prop<string>(),
  label: prop<string>(),
  options: prop<Record<string, any>>(),
}) {
  @modelAction
  update(updates: Partial<ModelCreationData<this>>) {
    applySnapshot(this, { ...getSnapshot(this), ...updates });
  }
}

@model("medior/_SavedImportConfigStore")
export class _SavedImportConfigStore extends Model({
  isLoading: prop<boolean>(false).withSetter(),
}) {
  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  createSavedImportConfig = asyncAction(async (args: Types.CreateSavedImportConfigInput) => {
    this.setIsLoading(true);
    const res = await trpc.createSavedImportConfig.mutate({ args });
    this.setIsLoading(false);
    if (res.error) throw new Error(res.error);
    return res.data;
  });

  @modelFlow
  deleteSavedImportConfig = asyncAction(async (args: Types.DeleteSavedImportConfigInput) => {
    this.setIsLoading(true);
    const res = await trpc.deleteSavedImportConfig.mutate({ args });
    this.setIsLoading(false);
    if (res.error) throw new Error(res.error);
    return res.data;
  });

  @modelFlow
  updateSavedImportConfig = asyncAction(async (args: Types.UpdateSavedImportConfigInput) => {
    this.setIsLoading(true);
    const res = await trpc.updateSavedImportConfig.mutate({ args });
    this.setIsLoading(false);
    if (res.error) throw new Error(res.error);
    return res.data;
  });
}
/* --------------------------------------------------------------------------- */
/*                               SavedSearch
/* --------------------------------------------------------------------------- */

@model("medior/_SavedSearch")
export class _SavedSearch extends Model({
  id: prop<string>(),
  dateCreated: prop<string>(() => dayjs().toISOString()),
  filterProps: prop<Record<string, any>>(),
  label: prop<string>(),
  searchType: prop<string>(),
}) {
  @modelAction
  update(updates: Partial<ModelCreationData<this>>) {
    applySnapshot(this, { ...getSnapshot(this), ...updates });
  }
}

@model("medior/_SavedSearchStore")
export class _SavedSearchStore extends Model({ isLoading: prop<boolean>(false).withSetter() }) {
  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  createSavedSearch = asyncAction(async (args: Types.CreateSavedSearchInput) => {
    this.setIsLoading(true);
    const res = await trpc.createSavedSearch.mutate({ args });
    this.setIsLoading(false);
    if (res.error) throw new Error(res.error);
    return res.data;
  });

  @modelFlow
  deleteSavedSearch = asyncAction(async (args: Types.DeleteSavedSearchInput) => {
    this.setIsLoading(true);
    const res = await trpc.deleteSavedSearch.mutate({ args });
    this.setIsLoading(false);
    if (res.error) throw new Error(res.error);
    return res.data;
  });

  @modelFlow
  updateSavedSearch = asyncAction(async (args: Types.UpdateSavedSearchInput) => {
    this.setIsLoading(true);
    const res = await trpc.updateSavedSearch.mutate({ args });
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
  category: prop<{
    color: CssColor | null;
    icon: IconName | null;
    inheritable: boolean;
    sortRank: number | null;
  }>(null),
  childIds: prop<string[]>(() => []),
  count: prop<number>(),
  dateModified: prop<string>(),
  dateOfInception: prop<string>(null),
  descendantIds: prop<string[]>(() => []),
  label: prop<string>(),
  lastSearchedAt: prop<string>(null),
  parentIds: prop<string[]>(() => []),
  rating: prop<number>(null),
  regEx: prop<string>(null),
  size: prop<number>(),
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
