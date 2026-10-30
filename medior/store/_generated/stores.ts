/* --------------------------------------------------------------------------- */
/*                               THIS IS A GENERATED FILE. DO NOT EDIT.
/* --------------------------------------------------------------------------- */
import autoBind from "auto-bind";
import { computed, reaction } from "mobx";
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
import { IconName, SortMenuProps } from "medior/components";
import * as Stores from "medior/store";
import { asyncAction, CssColor, derefMobx, toast } from "medior/utils/client";
import {
  applySelectionChanges,
  dayjs,
  getSelectionRange,
  isDeepEqual,
  LogicalOp,
  makeTagSelector,
} from "medior/utils/common";
import { getConfig, rpc } from "medior/utils/server";

/* --------------------------------------------------------------------------- */
/*                               SEARCH STORES
/* --------------------------------------------------------------------------- */

@model("medior/_FileSearch")
export class _FileSearch extends Model({
  bitrate: prop<{ logOp: LogicalOp | ""; value: number }>(() => ({ logOp: "", value: 0 })),
  bitrateMode: prop<"optional" | "required">("required").withSetter(),
  cachedFilterProps: prop<object | null>(null).withSetter(),
  carouselFileIds: prop<string[]>(() => []).withSetter(),
  dateCreatedEnd: prop<string>("").withSetter(),
  dateCreatedMode: prop<"optional" | "required">("required").withSetter(),
  dateCreatedStart: prop<string>("").withSetter(),
  dateImportedEnd: prop<string>("").withSetter(),
  dateImportedMode: prop<"optional" | "required">("required").withSetter(),
  dateImportedStart: prop<string>("").withSetter(),
  dateModifiedEnd: prop<string>("").withSetter(),
  dateModifiedMode: prop<"optional" | "required">("required").withSetter(),
  dateModifiedStart: prop<string>("").withSetter(),
  diffusionParams: prop<string>(null).withSetter(),
  diffusionParamsMode: prop<"optional" | "required">("required").withSetter(),
  duration: prop<{ logOp: LogicalOp | ""; value: number }>(() => ({ logOp: "", value: 0 })),
  durationMode: prop<"optional" | "required">("required").withSetter(),
  excludedFileIds: prop<string[]>(() => []).withSetter(),
  forcePages: prop<boolean>(false).withSetter(),
  frameRate: prop<{ logOp: LogicalOp | ""; value: number }>(() => ({ logOp: "", value: 0 })),
  frameRateMode: prop<"optional" | "required">("required").withSetter(),
  hasChanges: prop<boolean>(false).withSetter(),
  hasDiffParams: prop<boolean>(false).withSetter(),
  hasTimeline: prop<boolean>(false).withSetter(),
  heightMode: prop<"optional" | "required">("required").withSetter(),
  ids: prop<string[]>(() => []).withSetter(),
  isArchived: prop<boolean>(false).withSetter(),
  isCorrupted: prop<boolean>(null).withSetter(),
  isDeleteModalOpen: prop<boolean>(false).withSetter(),
  isLoading: prop<boolean>(false).withSetter(),
  isModified: prop<boolean>(null).withSetter(),
  isPageCountLoading: prop<boolean>(false).withSetter(),
  isSaveModalOpen: prop<boolean>(false).withSetter(),
  isSelecting: prop<boolean>(false).withSetter(),
  isTranscribed: prop<boolean>(null).withSetter(),
  loadId: prop<number>(0).withSetter(),
  longEdgeMode: prop<"optional" | "required">("required").withSetter(),
  maxHeight: prop<number>(null).withSetter(),
  maxLongEdge: prop<number>(null).withSetter(),
  maxShortEdge: prop<number>(null).withSetter(),
  maxSize: prop<number>(null).withSetter(),
  maxWidth: prop<number>(null).withSetter(),
  minHeight: prop<number>(null).withSetter(),
  minLongEdge: prop<number>(null).withSetter(),
  minShortEdge: prop<number>(null).withSetter(),
  minSize: prop<number>(null).withSetter(),
  minWidth: prop<number>(null).withSetter(),
  numOfCollections: prop<{ logOp: LogicalOp | ""; value: number }>(() => ({ logOp: "", value: 0 })),
  numOfCollectionsMode: prop<"optional" | "required">("required").withSetter(),
  numOfTags: prop<{ logOp: LogicalOp | ""; value: number }>(() => ({ logOp: "", value: 0 })),
  numOfTagsMode: prop<"optional" | "required">("required").withSetter(),
  originalPath: prop<string>(null).withSetter(),
  originalPathMode: prop<"optional" | "required">("required").withSetter(),
  page: prop<number>(1).withSetter(),
  pageCount: prop<number>(1).withSetter(),
  pageSize: prop<number>(() => getConfig().file.search.pageSize).withSetter(),
  rating: prop<{ logOp: LogicalOp | ""; value: number }>(() => ({ logOp: "", value: 0 })),
  ratingMode: prop<"optional" | "required">("required").withSetter(),
  results: prop<Stores.File[]>(() => []).withSetter(),
  savedSearches: prop<Stores.SavedSearch[]>(() => []).withSetter(),
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
  selectedSavedSearchId: prop<string>("").withSetter(),
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
  selectionId: prop<number>(0).withSetter(),
  shortEdgeMode: prop<"optional" | "required">("required").withSetter(),
  sizeMode: prop<"optional" | "required">("required").withSetter(),
  sortValue: prop<SortMenuProps["value"]>(() => getConfig().file.search.sort).withSetter(),
  tags: prop<Stores.TagOption[]>(() => []).withSetter(),
  transcription: prop<string>(null).withSetter(),
  transcriptionMode: prop<"optional" | "required">("required").withSetter(),
  widthMode: prop<"optional" | "required">("required").withSetter(),
}) {
  onInit() {
    autoBind(this);

    reaction(
      () => this.getFilterProps(),
      () => this.setHasChanges(true),
    );
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
  cancelLoad() {
    this.loadId += 1;
    this.isLoading = false;
    this.isPageCountLoading = false;
    this.selectionId += 1;
    this.isSelecting = false;
  }

  @modelAction
  cancelSelection() {
    this.selectionId += 1;
    this.isSelecting = false;
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
  setNumOfCollectionsOp(val: LogicalOp | "") {
    this.numOfCollections.logOp = val;

    if (val === "") this.numOfCollections.value = 0;
  }

  @modelAction
  setNumOfCollectionsValue(val: number) {
    this.numOfCollections.value = val;
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
    const removedIds = new Set(ids);

    this.results = this.results.filter((d) => !removedIds.has(d.id));
  }

  @modelAction
  reset() {
    this.bitrate = { logOp: "", value: 0 };
    this.bitrateMode = "required";
    this.cachedFilterProps = null;
    this.carouselFileIds = [];
    this.dateCreatedEnd = "";
    this.dateCreatedMode = "required";
    this.dateCreatedStart = "";
    this.dateImportedEnd = "";
    this.dateImportedMode = "required";
    this.dateImportedStart = "";
    this.dateModifiedEnd = "";
    this.dateModifiedMode = "required";
    this.dateModifiedStart = "";
    this.diffusionParams = null;
    this.diffusionParamsMode = "required";
    this.duration = { logOp: "", value: 0 };
    this.durationMode = "required";
    this.excludedFileIds = [];
    this.forcePages = false;
    this.frameRate = { logOp: "", value: 0 };
    this.frameRateMode = "required";
    this.hasChanges = false;
    this.hasDiffParams = false;
    this.hasTimeline = false;
    this.heightMode = "required";
    this.ids = [];
    this.isArchived = false;
    this.isCorrupted = null;
    this.isLoading = false;
    this.isModified = null;
    this.isPageCountLoading = false;
    this.isSelecting = false;
    this.isTranscribed = null;
    this.loadId += 1;
    this.longEdgeMode = "required";
    this.maxHeight = null;
    this.maxLongEdge = null;
    this.maxShortEdge = null;
    this.maxSize = null;
    this.maxWidth = null;
    this.minHeight = null;
    this.minLongEdge = null;
    this.minShortEdge = null;
    this.minSize = null;
    this.minWidth = null;
    this.numOfCollections = { logOp: "", value: 0 };
    this.numOfCollectionsMode = "required";
    this.numOfTags = { logOp: "", value: 0 };
    this.numOfTagsMode = "required";
    this.originalPath = null;
    this.originalPathMode = "required";
    this.page = 1;
    this.pageCount = 1;
    this.pageSize = getConfig().file.search.pageSize;
    this.rating = { logOp: "", value: 0 };
    this.ratingMode = "required";
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
    this.selectionId += 1;
    this.shortEdgeMode = "required";
    this.sizeMode = "required";
    this.sortValue = getConfig().file.search.sort;
    this.tags = [];
    this.transcription = null;
    this.transcriptionMode = "required";
    this.widthMode = "required";
  }

  @modelAction
  toggleSelected(selected: { id: string; isSelected?: boolean }[], withToast = false) {
    if (!selected?.length) return;

    const previous = this.selectedIdSet;
    const next = applySelectionChanges(this.selectedIds, selected);

    this.selectedIds = next;

    if (withToast) {
      const nextSet = new Set(next);
      const addedCount = next.filter((id) => !previous.has(id)).length;
      const removedCount = [...previous].filter((id) => !nextSet.has(id)).length;

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

    const res = await rpc.deleteSavedSearch({ args: { ids: [id] } });

    if (!res.success) throw new Error(res.error);

    await this.loadSavedSearches();

    if (this.selectedSavedSearchId === id) this.setSelectedSavedSearchId("");

    this.setIsDeleteModalOpen(false);
    toast.warn("Saved search deleted");
  });

  @modelFlow
  getShiftSelected = asyncAction(
    async ({ id, selectedIds }: { id: string; selectedIds: string[] }) => {
      const range = getSelectionRange({
        clickedId: id,
        orderedIds: this.results.map((r) => r.id),
        selectedIds,
      });

      if (range) return range;

      const selectionId = this.selectionId + 1;

      this.setSelectionId(selectionId);
      this.setIsSelecting(true);

      try {
        const res = await rpc.getShiftSelectedFile({
          ...this.cachedFilterProps,
          clickedId: id,
          selectedIds,
        });

        if (selectionId !== this.selectionId) return null;

        if (!res.success) throw new Error(res.error);

        return res.data;
      } catch (error) {
        if (selectionId === this.selectionId) throw error;

        return null;
      } finally {
        if (selectionId === this.selectionId) this.setIsSelecting(false);
      }
    },
  );

  @modelFlow
  handleSelect = asyncAction(
    async ({ hasCtrl, hasShift, id }: { hasCtrl: boolean; hasShift: boolean; id: string }) => {
      if (hasShift) {
        const res = await this.getShiftSelected({ id, selectedIds: this.selectedIds });

        if (!res?.success) throw new Error(res.error);

        if (res.data) {
          this.toggleSelected([
            ...res.data.idsToDeselect.map((i) => ({ id: i, isSelected: false })),
            ...res.data.idsToSelect.map((i) => ({ id: i, isSelected: true })),
          ]);
        }
      } else if (hasCtrl) {
        this.toggleSelected([{ id, isSelected: !this.getIsSelected(id) }]);
      } else if (this.selectedIds.length === 1 && this.getIsSelected(id)) {
        this.setSelectedIds([]);
      } else {
        this.setSelectedIds([id]);
      }
    },
  );

  @modelFlow
  selectAllInQuery = asyncAction(async (limit?: number) => {
    const filterProps = this.cachedFilterProps ?? this.getFilterProps();
    const selectionId = this.selectionId + 1;

    this.setSelectionId(selectionId);
    this.setIsSelecting(true);

    try {
      const res = await rpc.listFileSearchIds({
        ...filterProps,
        forcePages: this.forcePages,
        limit,
      });

      if (selectionId !== this.selectionId) return null;

      if (!res.success) throw new Error(res.error);

      this.setSelectedIds([...new Set([...this.selectedIds, ...res.data])]);

      return res.data.length;
    } catch (error) {
      if (selectionId === this.selectionId) throw error;

      return null;
    } finally {
      if (selectionId === this.selectionId) this.setIsSelecting(false);
    }
  });

  @modelFlow
  loadFiltered = asyncAction(
    async ({
      noCache,
      page,
      toLastPage,
      withFullCount,
    }: {
      noCache?: boolean;
      page?: number;
      toLastPage?: boolean;
      withFullCount?: boolean;
    } = {}) => {
      const loadId = this.loadId + 1;

      this.setLoadId(loadId);
      this.setIsLoading(true);
      this.setIsPageCountLoading(true);

      try {
        const shouldCacheFilterProps = noCache || !this.cachedFilterProps;
        const filterProps = shouldCacheFilterProps ? this.getFilterProps() : this.cachedFilterProps;

        // A selection still running over the previous query would add its results to the new one.
        if (shouldCacheFilterProps) this.cancelSelection();

        const exactCount = withFullCount || toLastPage;
        let nextPageCount = this.pageCount;

        if (exactCount) {
          const countRes = await rpc.getFilteredFileCount({
            ...filterProps,
            curMaxPage: this.pageCount,
            forcePages: this.forcePages,
            page,
            pageSize: this.pageSize,
            withFull: true,
          });

          if (loadId !== this.loadId) return;

          if (!countRes.success) throw new Error(countRes.error);

          nextPageCount = countRes.data.pageCount;
        }

        const newPage = toLastPage
          ? Math.max(nextPageCount, 1)
          : exactCount
            ? Math.min(page ?? this.page, Math.max(nextPageCount, 1))
            : (page ?? this.page);

        const itemsRes = await rpc.listFilteredFile({
          ...filterProps,
          forcePages: this.forcePages,
          page: newPage,
          pageSize: this.pageSize,
        });

        if (loadId !== this.loadId) return;

        if (!itemsRes.success) throw new Error(itemsRes.error);

        let items = itemsRes.data.items as ModelCreationData<Stores.File>[];

        const tagIds = [...new Set(items.flatMap((item) => item.tagIds))];

        if (tagIds.length) {
          const tagRes = await rpc.listTag({ filter: { id: tagIds } });

          if (loadId !== this.loadId) return;

          if (!tagRes.success) throw new Error(tagRes.error);

          const selectTags = makeTagSelector(tagRes.data);

          items = items.map((item) => ({ ...item, tags: selectTags(item.tagIds) }));
        }

        this.setResults(items.map((result) => new Stores.File(result)));
        this.setCarouselFileIds(itemsRes.data.carouselFileIds);

        if (shouldCacheFilterProps) this.setCachedFilterProps(derefMobx(filterProps));

        if (exactCount) {
          this.setPageCount(nextPageCount);
          this.setIsPageCountLoading(false);
        }

        this.setPage(newPage);
        this.setIsLoading(false);

        if (noCache) this.setHasChanges(false);

        if (!exactCount) {
          (async () => {
            try {
              const countRes = await rpc.getFilteredFileCount({
                ...filterProps,
                curMaxPage: this.pageCount,
                forcePages: this.forcePages,
                page: newPage,
                pageSize: this.pageSize,
                withFull: false,
              });

              if (loadId !== this.loadId) return;

              this.setIsPageCountLoading(false);

              if (!countRes.success) console.error(countRes.error);
              else this.setPageCount(countRes.data.pageCount);
            } catch (error) {
              if (loadId !== this.loadId) return;

              this.setIsPageCountLoading(false);
              console.error(error);
            }
          })();
        }

        return items;
      } catch (error) {
        if (loadId !== this.loadId) return;

        this.setIsLoading(false);
        this.setIsPageCountLoading(false);

        throw error;
      }
    },
  );

  @modelFlow
  loadSavedSearches = asyncAction(async () => {
    const res = await rpc.listSavedSearch({
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
    let res: Awaited<ReturnType<typeof rpc.createSavedSearch | typeof rpc.updateSavedSearch>>;

    if (selected)
      res = await rpc.updateSavedSearch({
        args: { id: selected.id, updates: { filterProps, label: trimmedLabel } },
      });
    else if (existing)
      res = await rpc.updateSavedSearch({
        args: { id: existing.id, updates: { filterProps } },
      });
    else
      res = await rpc.createSavedSearch({
        args: {
          dateCreated: dayjs().toISOString(),
          filterProps,
          label: trimmedLabel,
          searchType: "File",
        },
      });

    if (!res.success) throw new Error(res.error);

    await this.loadSavedSearches();
    this.setSelectedSavedSearchId(selected?.id ?? existing?.id ?? res.data.id);
    this.setIsSaveModalOpen(false);
    toast.success(selected || existing ? "Saved search updated" : "Saved search created");

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
      (!isDeepEqual(this.diffusionParams, null) ? 1 : 0) +
      (!isDeepEqual(this.duration, { logOp: "", value: 0 }) ? 1 : 0) +
      (!isDeepEqual(this.excludedFileIds, []) ? 1 : 0) +
      (!isDeepEqual(this.frameRate, { logOp: "", value: 0 }) ? 1 : 0) +
      (!isDeepEqual(this.hasDiffParams, false) ? 1 : 0) +
      (!isDeepEqual(this.hasTimeline, false) ? 1 : 0) +
      (!isDeepEqual(this.ids, []) ? 1 : 0) +
      (!isDeepEqual(this.isArchived, false) ? 1 : 0) +
      (!isDeepEqual(this.isCorrupted, null) ? 1 : 0) +
      (!isDeepEqual(this.isModified, null) ? 1 : 0) +
      (!isDeepEqual(this.isTranscribed, null) ? 1 : 0) +
      (!isDeepEqual(this.maxHeight, null) ? 1 : 0) +
      (!isDeepEqual(this.maxLongEdge, null) ? 1 : 0) +
      (!isDeepEqual(this.maxShortEdge, null) ? 1 : 0) +
      (!isDeepEqual(this.maxSize, null) ? 1 : 0) +
      (!isDeepEqual(this.maxWidth, null) ? 1 : 0) +
      (!isDeepEqual(this.minHeight, null) ? 1 : 0) +
      (!isDeepEqual(this.minLongEdge, null) ? 1 : 0) +
      (!isDeepEqual(this.minShortEdge, null) ? 1 : 0) +
      (!isDeepEqual(this.minSize, null) ? 1 : 0) +
      (!isDeepEqual(this.minWidth, null) ? 1 : 0) +
      (!isDeepEqual(this.numOfCollections, { logOp: "", value: 0 }) ? 1 : 0) +
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
      (!isDeepEqual(this.tags, []) ? 1 : 0) +
      (!isDeepEqual(this.transcription, null) ? 1 : 0)
    );
  }

  @computed({ keepAlive: true })
  get resultsById() {
    return new Map(this.results.map((result) => [result.id, result]));
  }

  @computed({ keepAlive: true })
  get selectedIdSet() {
    return new Set(this.selectedIds);
  }

  /* DYNAMIC GETTERS */
  getCachedFilterProps() {
    if (!this.cachedFilterProps) this.setCachedFilterProps(derefMobx(this.getFilterProps()));

    return this.cachedFilterProps;
  }

  getFilterProps() {
    return {
      bitrate: this.bitrate,
      bitrateMode: this.bitrateMode,
      dateCreatedEnd: this.dateCreatedEnd,
      dateCreatedMode: this.dateCreatedMode,
      dateCreatedStart: this.dateCreatedStart,
      dateImportedEnd: this.dateImportedEnd,
      dateImportedMode: this.dateImportedMode,
      dateImportedStart: this.dateImportedStart,
      dateModifiedEnd: this.dateModifiedEnd,
      dateModifiedMode: this.dateModifiedMode,
      dateModifiedStart: this.dateModifiedStart,
      diffusionParams: this.diffusionParams,
      diffusionParamsMode: this.diffusionParamsMode,
      duration: this.duration,
      durationMode: this.durationMode,
      excludedFileIds: this.excludedFileIds,
      frameRate: this.frameRate,
      frameRateMode: this.frameRateMode,
      hasDiffParams: this.hasDiffParams,
      hasTimeline: this.hasTimeline,
      heightMode: this.heightMode,
      ids: this.ids,
      isArchived: this.isArchived,
      isCorrupted: this.isCorrupted,
      isModified: this.isModified,
      isTranscribed: this.isTranscribed,
      longEdgeMode: this.longEdgeMode,
      maxHeight: this.maxHeight,
      maxLongEdge: this.maxLongEdge,
      maxShortEdge: this.maxShortEdge,
      maxSize: this.maxSize,
      maxWidth: this.maxWidth,
      minHeight: this.minHeight,
      minLongEdge: this.minLongEdge,
      minShortEdge: this.minShortEdge,
      minSize: this.minSize,
      minWidth: this.minWidth,
      numOfCollections: this.numOfCollections,
      numOfCollectionsMode: this.numOfCollectionsMode,
      numOfTags: this.numOfTags,
      numOfTagsMode: this.numOfTagsMode,
      originalPath: this.originalPath,
      originalPathMode: this.originalPathMode,
      rating: this.rating,
      ratingMode: this.ratingMode,
      selectedAudioCodecs: this.selectedAudioCodecs,
      selectedImageExts: this.selectedImageExts,
      selectedVideoCodecs: this.selectedVideoCodecs,
      selectedVideoExts: this.selectedVideoExts,
      shortEdgeMode: this.shortEdgeMode,
      sizeMode: this.sizeMode,
      sortValue: this.sortValue,
      ...getRootStore<Stores.RootStore>(this)?.tag?.tagSearchOptsToIds(this.tags),
      transcription: this.transcription,
      transcriptionMode: this.transcriptionMode,
      widthMode: this.widthMode,
    };
  }

  getIsSelected(id: string) {
    return this.selectedIdSet.has(id);
  }

  getResult(id: string) {
    return this.resultsById.get(id);
  }

  getSearchProps() {
    return derefMobx({
      bitrate: this.bitrate,
      bitrateMode: this.bitrateMode,
      dateCreatedEnd: this.dateCreatedEnd,
      dateCreatedMode: this.dateCreatedMode,
      dateCreatedStart: this.dateCreatedStart,
      dateImportedEnd: this.dateImportedEnd,
      dateImportedMode: this.dateImportedMode,
      dateImportedStart: this.dateImportedStart,
      dateModifiedEnd: this.dateModifiedEnd,
      dateModifiedMode: this.dateModifiedMode,
      dateModifiedStart: this.dateModifiedStart,
      diffusionParams: this.diffusionParams,
      diffusionParamsMode: this.diffusionParamsMode,
      duration: this.duration,
      durationMode: this.durationMode,
      excludedFileIds: this.excludedFileIds,
      frameRate: this.frameRate,
      frameRateMode: this.frameRateMode,
      hasDiffParams: this.hasDiffParams,
      hasTimeline: this.hasTimeline,
      heightMode: this.heightMode,
      ids: this.ids,
      isArchived: this.isArchived,
      isCorrupted: this.isCorrupted,
      isModified: this.isModified,
      isTranscribed: this.isTranscribed,
      longEdgeMode: this.longEdgeMode,
      maxHeight: this.maxHeight,
      maxLongEdge: this.maxLongEdge,
      maxShortEdge: this.maxShortEdge,
      maxSize: this.maxSize,
      maxWidth: this.maxWidth,
      minHeight: this.minHeight,
      minLongEdge: this.minLongEdge,
      minShortEdge: this.minShortEdge,
      minSize: this.minSize,
      minWidth: this.minWidth,
      numOfCollections: this.numOfCollections,
      numOfCollectionsMode: this.numOfCollectionsMode,
      numOfTags: this.numOfTags,
      numOfTagsMode: this.numOfTagsMode,
      originalPath: this.originalPath,
      originalPathMode: this.originalPathMode,
      rating: this.rating,
      ratingMode: this.ratingMode,
      selectedAudioCodecs: this.selectedAudioCodecs,
      selectedImageExts: this.selectedImageExts,
      selectedVideoCodecs: this.selectedVideoCodecs,
      selectedVideoExts: this.selectedVideoExts,
      shortEdgeMode: this.shortEdgeMode,
      sizeMode: this.sizeMode,
      sortValue: this.sortValue,
      tags: this.tags,
      transcription: this.transcription,
      transcriptionMode: this.transcriptionMode,
      widthMode: this.widthMode,
    });
  }
}

@model("medior/_FileCollectionSearch")
export class _FileCollectionSearch extends Model({
  cachedFilterProps: prop<object | null>(null).withSetter(),
  dateCreatedEnd: prop<string>("").withSetter(),
  dateCreatedMode: prop<"optional" | "required">("required").withSetter(),
  dateCreatedStart: prop<string>("").withSetter(),
  dateModifiedEnd: prop<string>("").withSetter(),
  dateModifiedMode: prop<"optional" | "required">("required").withSetter(),
  dateModifiedStart: prop<string>("").withSetter(),
  fileCount: prop<{ logOp: LogicalOp | ""; value: number }>(() => ({ logOp: "", value: 0 })),
  fileCountMode: prop<"optional" | "required">("required").withSetter(),
  forcePages: prop<boolean>(false).withSetter(),
  hasChanges: prop<boolean>(false).withSetter(),
  ids: prop<string[]>(() => []).withSetter(),
  isDeleteModalOpen: prop<boolean>(false).withSetter(),
  isLoading: prop<boolean>(false).withSetter(),
  isPageCountLoading: prop<boolean>(false).withSetter(),
  isSaveModalOpen: prop<boolean>(false).withSetter(),
  isSelecting: prop<boolean>(false).withSetter(),
  loadId: prop<number>(0).withSetter(),
  maxSize: prop<number>(null).withSetter(),
  minSize: prop<number>(null).withSetter(),
  page: prop<number>(1).withSetter(),
  pageCount: prop<number>(1).withSetter(),
  pageSize: prop<number>(() => getConfig().collection.manager.search.pageSize).withSetter(),
  rating: prop<{ logOp: LogicalOp | ""; value: number }>(() => ({ logOp: "", value: 0 })),
  ratingMode: prop<"optional" | "required">("required").withSetter(),
  results: prop<Stores.FileCollection[]>(() => []).withSetter(),
  savedSearches: prop<Stores.SavedSearch[]>(() => []).withSetter(),
  selectedIds: prop<string[]>(() => []).withSetter(),
  selectedSavedSearchId: prop<string>("").withSetter(),
  selectionId: prop<number>(0).withSetter(),
  sizeMode: prop<"optional" | "required">("required").withSetter(),
  sortValue: prop<SortMenuProps["value"]>(
    () => getConfig().collection.manager.search.sort,
  ).withSetter(),
  tags: prop<Stores.TagOption[]>(() => []).withSetter(),
  title: prop<string>("").withSetter(),
  titleMode: prop<"optional" | "required">("required").withSetter(),
}) {
  onInit() {
    autoBind(this);

    reaction(
      () => this.getFilterProps(),
      () => this.setHasChanges(true),
    );
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
  cancelLoad() {
    this.loadId += 1;
    this.isLoading = false;
    this.isPageCountLoading = false;
    this.selectionId += 1;
    this.isSelecting = false;
  }

  @modelAction
  cancelSelection() {
    this.selectionId += 1;
    this.isSelecting = false;
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
    const removedIds = new Set(ids);

    this.results = this.results.filter((d) => !removedIds.has(d.id));
  }

  @modelAction
  reset() {
    this.cachedFilterProps = null;
    this.dateCreatedEnd = "";
    this.dateCreatedMode = "required";
    this.dateCreatedStart = "";
    this.dateModifiedEnd = "";
    this.dateModifiedMode = "required";
    this.dateModifiedStart = "";
    this.fileCount = { logOp: "", value: 0 };
    this.fileCountMode = "required";
    this.forcePages = false;
    this.hasChanges = false;
    this.ids = [];
    this.isLoading = false;
    this.isPageCountLoading = false;
    this.isSelecting = false;
    this.loadId += 1;
    this.maxSize = null;
    this.minSize = null;
    this.page = 1;
    this.pageCount = 1;
    this.pageSize = getConfig().collection.manager.search.pageSize;
    this.rating = { logOp: "", value: 0 };
    this.ratingMode = "required";
    this.results = [];
    this.selectedIds = [];
    this.selectionId += 1;
    this.sizeMode = "required";
    this.sortValue = getConfig().collection.manager.search.sort;
    this.tags = [];
    this.title = "";
    this.titleMode = "required";
  }

  @modelAction
  toggleSelected(selected: { id: string; isSelected?: boolean }[], withToast = false) {
    if (!selected?.length) return;

    const previous = this.selectedIdSet;
    const next = applySelectionChanges(this.selectedIds, selected);

    this.selectedIds = next;

    if (withToast) {
      const nextSet = new Set(next);
      const addedCount = next.filter((id) => !previous.has(id)).length;
      const removedCount = [...previous].filter((id) => !nextSet.has(id)).length;

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

    const res = await rpc.deleteSavedSearch({ args: { ids: [id] } });

    if (!res.success) throw new Error(res.error);

    await this.loadSavedSearches();

    if (this.selectedSavedSearchId === id) this.setSelectedSavedSearchId("");

    this.setIsDeleteModalOpen(false);
    toast.warn("Saved search deleted");
  });

  @modelFlow
  getShiftSelected = asyncAction(
    async ({ id, selectedIds }: { id: string; selectedIds: string[] }) => {
      const range = getSelectionRange({
        clickedId: id,
        orderedIds: this.results.map((r) => r.id),
        selectedIds,
      });

      if (range) return range;

      const selectionId = this.selectionId + 1;

      this.setSelectionId(selectionId);
      this.setIsSelecting(true);

      try {
        const res = await rpc.getShiftSelectedFileCollection({
          ...this.cachedFilterProps,
          clickedId: id,
          selectedIds,
        });

        if (selectionId !== this.selectionId) return null;

        if (!res.success) throw new Error(res.error);

        return res.data;
      } catch (error) {
        if (selectionId === this.selectionId) throw error;

        return null;
      } finally {
        if (selectionId === this.selectionId) this.setIsSelecting(false);
      }
    },
  );

  @modelFlow
  handleSelect = asyncAction(
    async ({ hasCtrl, hasShift, id }: { hasCtrl: boolean; hasShift: boolean; id: string }) => {
      if (hasShift) {
        const res = await this.getShiftSelected({ id, selectedIds: this.selectedIds });

        if (!res?.success) throw new Error(res.error);

        if (res.data) {
          this.toggleSelected([
            ...res.data.idsToDeselect.map((i) => ({ id: i, isSelected: false })),
            ...res.data.idsToSelect.map((i) => ({ id: i, isSelected: true })),
          ]);
        }
      } else if (hasCtrl) {
        this.toggleSelected([{ id, isSelected: !this.getIsSelected(id) }]);
      } else if (this.selectedIds.length === 1 && this.getIsSelected(id)) {
        this.setSelectedIds([]);
      } else {
        this.setSelectedIds([id]);
      }
    },
  );

  @modelFlow
  selectAllInQuery = asyncAction(async () => {
    const filterProps = this.cachedFilterProps ?? this.getFilterProps();
    const selectionId = this.selectionId + 1;

    this.setSelectionId(selectionId);
    this.setIsSelecting(true);

    try {
      const countRes = await rpc.getFilteredFileCollectionCount({
        ...filterProps,
        curMaxPage: this.pageCount,
        forcePages: this.forcePages,
        page: this.page,
        pageSize: this.pageSize,
        withFull: true,
      });

      if (selectionId !== this.selectionId) return null;

      if (!countRes.success) throw new Error(countRes.error);

      if (countRes.data.count === 0) return 0;

      const res = await rpc.listFilteredFileCollection({
        ...filterProps,
        forcePages: this.forcePages,
        page: 1,
        pageSize: countRes.data.count,
        select: { _id: 1 },
      });

      if (selectionId !== this.selectionId) return null;

      if (!res.success) throw new Error(res.error);

      this.toggleSelected(res.data.map(({ id }) => ({ id, isSelected: true })));

      return res.data.length;
    } catch (error) {
      if (selectionId === this.selectionId) throw error;

      return null;
    } finally {
      if (selectionId === this.selectionId) this.setIsSelecting(false);
    }
  });

  @modelFlow
  loadFiltered = asyncAction(
    async ({
      noCache,
      page,
      toLastPage,
      withFullCount,
    }: {
      noCache?: boolean;
      page?: number;
      toLastPage?: boolean;
      withFullCount?: boolean;
    } = {}) => {
      const loadId = this.loadId + 1;

      this.setLoadId(loadId);
      this.setIsLoading(true);
      this.setIsPageCountLoading(true);

      try {
        const shouldCacheFilterProps = noCache || !this.cachedFilterProps;
        const filterProps = shouldCacheFilterProps ? this.getFilterProps() : this.cachedFilterProps;

        // A selection still running over the previous query would add its results to the new one.
        if (shouldCacheFilterProps) this.cancelSelection();

        const exactCount = withFullCount || toLastPage;
        let nextPageCount = this.pageCount;

        if (exactCount) {
          const countRes = await rpc.getFilteredFileCollectionCount({
            ...filterProps,
            curMaxPage: this.pageCount,
            forcePages: this.forcePages,
            page,
            pageSize: this.pageSize,
            withFull: true,
          });

          if (loadId !== this.loadId) return;

          if (!countRes.success) throw new Error(countRes.error);

          nextPageCount = countRes.data.pageCount;
        }

        const newPage = toLastPage
          ? Math.max(nextPageCount, 1)
          : exactCount
            ? Math.min(page ?? this.page, Math.max(nextPageCount, 1))
            : (page ?? this.page);

        const itemsRes = await rpc.listFilteredFileCollection({
          ...filterProps,
          forcePages: this.forcePages,
          page: newPage,
          pageSize: this.pageSize,
        });

        if (loadId !== this.loadId) return;

        if (!itemsRes.success) throw new Error(itemsRes.error);

        let items = itemsRes.data;

        const tagIds = [...new Set(items.flatMap((item) => item.tagIds))];

        if (tagIds.length) {
          const tagRes = await rpc.listTag({ filter: { id: tagIds } });

          if (loadId !== this.loadId) return;

          if (!tagRes.success) throw new Error(tagRes.error);

          const selectTags = makeTagSelector(tagRes.data);

          items = items.map((item) => ({ ...item, tags: selectTags(item.tagIds) }));
        }

        this.setResults(items.map((result) => new Stores.FileCollection(result)));

        if (shouldCacheFilterProps) this.setCachedFilterProps(derefMobx(filterProps));

        if (exactCount) {
          this.setPageCount(nextPageCount);
          this.setIsPageCountLoading(false);
        }

        this.setPage(newPage);
        this.setIsLoading(false);

        if (noCache) this.setHasChanges(false);

        if (!exactCount) {
          (async () => {
            try {
              const countRes = await rpc.getFilteredFileCollectionCount({
                ...filterProps,
                curMaxPage: this.pageCount,
                forcePages: this.forcePages,
                page: newPage,
                pageSize: this.pageSize,
                withFull: false,
              });

              if (loadId !== this.loadId) return;

              this.setIsPageCountLoading(false);

              if (!countRes.success) console.error(countRes.error);
              else this.setPageCount(countRes.data.pageCount);
            } catch (error) {
              if (loadId !== this.loadId) return;

              this.setIsPageCountLoading(false);
              console.error(error);
            }
          })();
        }

        return items;
      } catch (error) {
        if (loadId !== this.loadId) return;

        this.setIsLoading(false);
        this.setIsPageCountLoading(false);

        throw error;
      }
    },
  );

  @modelFlow
  loadSavedSearches = asyncAction(async () => {
    const res = await rpc.listSavedSearch({
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
    let res: Awaited<ReturnType<typeof rpc.createSavedSearch | typeof rpc.updateSavedSearch>>;

    if (selected)
      res = await rpc.updateSavedSearch({
        args: { id: selected.id, updates: { filterProps, label: trimmedLabel } },
      });
    else if (existing)
      res = await rpc.updateSavedSearch({
        args: { id: existing.id, updates: { filterProps } },
      });
    else
      res = await rpc.createSavedSearch({
        args: {
          dateCreated: dayjs().toISOString(),
          filterProps,
          label: trimmedLabel,
          searchType: "FileCollection",
        },
      });

    if (!res.success) throw new Error(res.error);

    await this.loadSavedSearches();
    this.setSelectedSavedSearchId(selected?.id ?? existing?.id ?? res.data.id);
    this.setIsSaveModalOpen(false);
    toast.success(selected || existing ? "Saved search updated" : "Saved search created");

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

  @computed({ keepAlive: true })
  get resultsById() {
    return new Map(this.results.map((result) => [result.id, result]));
  }

  @computed({ keepAlive: true })
  get selectedIdSet() {
    return new Set(this.selectedIds);
  }

  /* DYNAMIC GETTERS */
  getCachedFilterProps() {
    if (!this.cachedFilterProps) this.setCachedFilterProps(derefMobx(this.getFilterProps()));

    return this.cachedFilterProps;
  }

  getFilterProps() {
    return {
      dateCreatedEnd: this.dateCreatedEnd,
      dateCreatedMode: this.dateCreatedMode,
      dateCreatedStart: this.dateCreatedStart,
      dateModifiedEnd: this.dateModifiedEnd,
      dateModifiedMode: this.dateModifiedMode,
      dateModifiedStart: this.dateModifiedStart,
      fileCount: this.fileCount,
      fileCountMode: this.fileCountMode,
      ids: this.ids,
      maxSize: this.maxSize,
      minSize: this.minSize,
      rating: this.rating,
      ratingMode: this.ratingMode,
      sizeMode: this.sizeMode,
      sortValue: this.sortValue,
      ...getRootStore<Stores.RootStore>(this)?.tag?.tagSearchOptsToIds(this.tags),
      title: this.title,
      titleMode: this.titleMode,
    };
  }

  getIsSelected(id: string) {
    return this.selectedIdSet.has(id);
  }

  getResult(id: string) {
    return this.resultsById.get(id);
  }

  getSearchProps() {
    return derefMobx({
      dateCreatedEnd: this.dateCreatedEnd,
      dateCreatedMode: this.dateCreatedMode,
      dateCreatedStart: this.dateCreatedStart,
      dateModifiedEnd: this.dateModifiedEnd,
      dateModifiedMode: this.dateModifiedMode,
      dateModifiedStart: this.dateModifiedStart,
      fileCount: this.fileCount,
      fileCountMode: this.fileCountMode,
      ids: this.ids,
      maxSize: this.maxSize,
      minSize: this.minSize,
      rating: this.rating,
      ratingMode: this.ratingMode,
      sizeMode: this.sizeMode,
      sortValue: this.sortValue,
      tags: this.tags,
      title: this.title,
      titleMode: this.titleMode,
    });
  }
}

@model("medior/_FileImportBatchSearch")
export class _FileImportBatchSearch extends Model({
  cachedFilterProps: prop<object | null>(null).withSetter(),
  collectionTitle: prop<string>("").withSetter(),
  collectionTitleMode: prop<"optional" | "required">("required").withSetter(),
  completedAtEnd: prop<string>("").withSetter(),
  completedAtMode: prop<"optional" | "required">("required").withSetter(),
  completedAtStart: prop<string>("").withSetter(),
  dateCreatedEnd: prop<string>("").withSetter(),
  dateCreatedMode: prop<"optional" | "required">("required").withSetter(),
  dateCreatedStart: prop<string>("").withSetter(),
  fileCount: prop<{ logOp: LogicalOp | ""; value: number }>(() => ({ logOp: "", value: 0 })),
  fileCountMode: prop<"optional" | "required">("required").withSetter(),
  filePath: prop<string>(null).withSetter(),
  filePathMode: prop<"optional" | "required">("required").withSetter(),
  forcePages: prop<boolean>(false).withSetter(),
  hasChanges: prop<boolean>(false).withSetter(),
  ids: prop<string[]>(() => []).withSetter(),
  isCompleted: prop<boolean>(false).withSetter(),
  isDeleteModalOpen: prop<boolean>(false).withSetter(),
  isLoading: prop<boolean>(false).withSetter(),
  isPageCountLoading: prop<boolean>(false).withSetter(),
  isSaveModalOpen: prop<boolean>(false).withSetter(),
  isSelecting: prop<boolean>(false).withSetter(),
  loadId: prop<number>(0).withSetter(),
  page: prop<number>(1).withSetter(),
  pageCount: prop<number>(1).withSetter(),
  pageSize: prop<number>(() => getConfig().imports.manager.search.pageSize).withSetter(),
  results: prop<Stores.FileImportBatch[]>(() => []).withSetter(),
  savedSearches: prop<Stores.SavedSearch[]>(() => []).withSetter(),
  selectedIds: prop<string[]>(() => []).withSetter(),
  selectedSavedSearchId: prop<string>("").withSetter(),
  selectionId: prop<number>(0).withSetter(),
  sortValue: prop<SortMenuProps["value"]>(
    () => getConfig().imports.manager.search.sort,
  ).withSetter(),
  startedAtEnd: prop<string>("").withSetter(),
  startedAtMode: prop<"optional" | "required">("required").withSetter(),
  startedAtStart: prop<string>("").withSetter(),
  statuses: prop<Types.ImportStatus[]>(() => []).withSetter(),
  tags: prop<Stores.TagOption[]>(() => []).withSetter(),
}) {
  onInit() {
    autoBind(this);

    reaction(
      () => this.getFilterProps(),
      () => this.setHasChanges(true),
    );
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
  cancelLoad() {
    this.loadId += 1;
    this.isLoading = false;
    this.isPageCountLoading = false;
    this.selectionId += 1;
    this.isSelecting = false;
  }

  @modelAction
  cancelSelection() {
    this.selectionId += 1;
    this.isSelecting = false;
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
    const removedIds = new Set(ids);

    this.results = this.results.filter((d) => !removedIds.has(d.id));
  }

  @modelAction
  reset() {
    this.cachedFilterProps = null;
    this.collectionTitle = "";
    this.collectionTitleMode = "required";
    this.completedAtEnd = "";
    this.completedAtMode = "required";
    this.completedAtStart = "";
    this.dateCreatedEnd = "";
    this.dateCreatedMode = "required";
    this.dateCreatedStart = "";
    this.fileCount = { logOp: "", value: 0 };
    this.fileCountMode = "required";
    this.filePath = null;
    this.filePathMode = "required";
    this.forcePages = false;
    this.hasChanges = false;
    this.ids = [];
    this.isCompleted = false;
    this.isLoading = false;
    this.isPageCountLoading = false;
    this.isSelecting = false;
    this.loadId += 1;
    this.page = 1;
    this.pageCount = 1;
    this.pageSize = getConfig().imports.manager.search.pageSize;
    this.results = [];
    this.selectedIds = [];
    this.selectionId += 1;
    this.sortValue = getConfig().imports.manager.search.sort;
    this.startedAtEnd = "";
    this.startedAtMode = "required";
    this.startedAtStart = "";
    this.statuses = [];
    this.tags = [];
  }

  @modelAction
  toggleSelected(selected: { id: string; isSelected?: boolean }[], withToast = false) {
    if (!selected?.length) return;

    const previous = this.selectedIdSet;
    const next = applySelectionChanges(this.selectedIds, selected);

    this.selectedIds = next;

    if (withToast) {
      const nextSet = new Set(next);
      const addedCount = next.filter((id) => !previous.has(id)).length;
      const removedCount = [...previous].filter((id) => !nextSet.has(id)).length;

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

    const res = await rpc.deleteSavedSearch({ args: { ids: [id] } });

    if (!res.success) throw new Error(res.error);

    await this.loadSavedSearches();

    if (this.selectedSavedSearchId === id) this.setSelectedSavedSearchId("");

    this.setIsDeleteModalOpen(false);
    toast.warn("Saved search deleted");
  });

  @modelFlow
  getShiftSelected = asyncAction(
    async ({ id, selectedIds }: { id: string; selectedIds: string[] }) => {
      const range = getSelectionRange({
        clickedId: id,
        orderedIds: this.results.map((r) => r.id),
        selectedIds,
      });

      if (range) return range;

      const selectionId = this.selectionId + 1;

      this.setSelectionId(selectionId);
      this.setIsSelecting(true);

      try {
        const res = await rpc.getShiftSelectedFileImportBatch({
          ...this.cachedFilterProps,
          clickedId: id,
          selectedIds,
        });

        if (selectionId !== this.selectionId) return null;

        if (!res.success) throw new Error(res.error);

        return res.data;
      } catch (error) {
        if (selectionId === this.selectionId) throw error;

        return null;
      } finally {
        if (selectionId === this.selectionId) this.setIsSelecting(false);
      }
    },
  );

  @modelFlow
  handleSelect = asyncAction(
    async ({ hasCtrl, hasShift, id }: { hasCtrl: boolean; hasShift: boolean; id: string }) => {
      if (hasShift) {
        const res = await this.getShiftSelected({ id, selectedIds: this.selectedIds });

        if (!res?.success) throw new Error(res.error);

        if (res.data) {
          this.toggleSelected([
            ...res.data.idsToDeselect.map((i) => ({ id: i, isSelected: false })),
            ...res.data.idsToSelect.map((i) => ({ id: i, isSelected: true })),
          ]);
        }
      } else if (hasCtrl) {
        this.toggleSelected([{ id, isSelected: !this.getIsSelected(id) }]);
      } else if (this.selectedIds.length === 1 && this.getIsSelected(id)) {
        this.setSelectedIds([]);
      } else {
        this.setSelectedIds([id]);
      }
    },
  );

  @modelFlow
  selectAllInQuery = asyncAction(async () => {
    const filterProps = this.cachedFilterProps ?? this.getFilterProps();
    const selectionId = this.selectionId + 1;

    this.setSelectionId(selectionId);
    this.setIsSelecting(true);

    try {
      const countRes = await rpc.getFilteredFileImportBatchCount({
        ...filterProps,
        curMaxPage: this.pageCount,
        forcePages: this.forcePages,
        page: this.page,
        pageSize: this.pageSize,
        withFull: true,
      });

      if (selectionId !== this.selectionId) return null;

      if (!countRes.success) throw new Error(countRes.error);

      if (countRes.data.count === 0) return 0;

      const res = await rpc.listFilteredFileImportBatch({
        ...filterProps,
        forcePages: this.forcePages,
        page: 1,
        pageSize: countRes.data.count,
        select: { _id: 1 },
      });

      if (selectionId !== this.selectionId) return null;

      if (!res.success) throw new Error(res.error);

      this.toggleSelected(res.data.map(({ id }) => ({ id, isSelected: true })));

      return res.data.length;
    } catch (error) {
      if (selectionId === this.selectionId) throw error;

      return null;
    } finally {
      if (selectionId === this.selectionId) this.setIsSelecting(false);
    }
  });

  @modelFlow
  loadFiltered = asyncAction(
    async ({
      noCache,
      page,
      toLastPage,
      withFullCount,
    }: {
      noCache?: boolean;
      page?: number;
      toLastPage?: boolean;
      withFullCount?: boolean;
    } = {}) => {
      const loadId = this.loadId + 1;

      this.setLoadId(loadId);
      this.setIsLoading(true);
      this.setIsPageCountLoading(true);

      try {
        const shouldCacheFilterProps = noCache || !this.cachedFilterProps;
        const filterProps = shouldCacheFilterProps ? this.getFilterProps() : this.cachedFilterProps;

        // A selection still running over the previous query would add its results to the new one.
        if (shouldCacheFilterProps) this.cancelSelection();

        const exactCount = withFullCount || toLastPage;
        let nextPageCount = this.pageCount;

        if (exactCount) {
          const countRes = await rpc.getFilteredFileImportBatchCount({
            ...filterProps,
            curMaxPage: this.pageCount,
            forcePages: this.forcePages,
            page,
            pageSize: this.pageSize,
            withFull: true,
          });

          if (loadId !== this.loadId) return;

          if (!countRes.success) throw new Error(countRes.error);

          nextPageCount = countRes.data.pageCount;
        }

        const newPage = toLastPage
          ? Math.max(nextPageCount, 1)
          : exactCount
            ? Math.min(page ?? this.page, Math.max(nextPageCount, 1))
            : (page ?? this.page);

        const itemsRes = await rpc.listFilteredFileImportBatch({
          ...filterProps,
          forcePages: this.forcePages,
          page: newPage,
          pageSize: this.pageSize,
        });

        if (loadId !== this.loadId) return;

        if (!itemsRes.success) throw new Error(itemsRes.error);

        let items = itemsRes.data;

        const tagIds = [...new Set(items.flatMap((item) => item.tagIds))];

        if (tagIds.length) {
          const tagRes = await rpc.listTag({ filter: { id: tagIds } });

          if (loadId !== this.loadId) return;

          if (!tagRes.success) throw new Error(tagRes.error);

          const selectTags = makeTagSelector(tagRes.data);

          items = items.map((item) => ({ ...item, tags: selectTags(item.tagIds) }));
        }

        this.setResults(items.map((result) => new Stores.FileImportBatch(result)));

        if (shouldCacheFilterProps) this.setCachedFilterProps(derefMobx(filterProps));

        if (exactCount) {
          this.setPageCount(nextPageCount);
          this.setIsPageCountLoading(false);
        }

        this.setPage(newPage);
        this.setIsLoading(false);

        if (noCache) this.setHasChanges(false);

        if (!exactCount) {
          (async () => {
            try {
              const countRes = await rpc.getFilteredFileImportBatchCount({
                ...filterProps,
                curMaxPage: this.pageCount,
                forcePages: this.forcePages,
                page: newPage,
                pageSize: this.pageSize,
                withFull: false,
              });

              if (loadId !== this.loadId) return;

              this.setIsPageCountLoading(false);

              if (!countRes.success) console.error(countRes.error);
              else this.setPageCount(countRes.data.pageCount);
            } catch (error) {
              if (loadId !== this.loadId) return;

              this.setIsPageCountLoading(false);
              console.error(error);
            }
          })();
        }

        return items;
      } catch (error) {
        if (loadId !== this.loadId) return;

        this.setIsLoading(false);
        this.setIsPageCountLoading(false);

        throw error;
      }
    },
  );

  @modelFlow
  loadSavedSearches = asyncAction(async () => {
    const res = await rpc.listSavedSearch({
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
    let res: Awaited<ReturnType<typeof rpc.createSavedSearch | typeof rpc.updateSavedSearch>>;

    if (selected)
      res = await rpc.updateSavedSearch({
        args: { id: selected.id, updates: { filterProps, label: trimmedLabel } },
      });
    else if (existing)
      res = await rpc.updateSavedSearch({
        args: { id: existing.id, updates: { filterProps } },
      });
    else
      res = await rpc.createSavedSearch({
        args: {
          dateCreated: dayjs().toISOString(),
          filterProps,
          label: trimmedLabel,
          searchType: "FileImportBatch",
        },
      });

    if (!res.success) throw new Error(res.error);

    await this.loadSavedSearches();
    this.setSelectedSavedSearchId(selected?.id ?? existing?.id ?? res.data.id);
    this.setIsSaveModalOpen(false);
    toast.success(selected || existing ? "Saved search updated" : "Saved search created");

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
      (!isDeepEqual(this.statuses, []) ? 1 : 0) +
      (!isDeepEqual(this.tags, []) ? 1 : 0)
    );
  }

  @computed({ keepAlive: true })
  get resultsById() {
    return new Map(this.results.map((result) => [result.id, result]));
  }

  @computed({ keepAlive: true })
  get selectedIdSet() {
    return new Set(this.selectedIds);
  }

  /* DYNAMIC GETTERS */
  getCachedFilterProps() {
    if (!this.cachedFilterProps) this.setCachedFilterProps(derefMobx(this.getFilterProps()));

    return this.cachedFilterProps;
  }

  getFilterProps() {
    return {
      collectionTitle: this.collectionTitle,
      collectionTitleMode: this.collectionTitleMode,
      completedAtEnd: this.completedAtEnd,
      completedAtMode: this.completedAtMode,
      completedAtStart: this.completedAtStart,
      dateCreatedEnd: this.dateCreatedEnd,
      dateCreatedMode: this.dateCreatedMode,
      dateCreatedStart: this.dateCreatedStart,
      fileCount: this.fileCount,
      fileCountMode: this.fileCountMode,
      filePath: this.filePath,
      filePathMode: this.filePathMode,
      ids: this.ids,
      isCompleted: this.isCompleted,
      sortValue: this.sortValue,
      startedAtEnd: this.startedAtEnd,
      startedAtMode: this.startedAtMode,
      startedAtStart: this.startedAtStart,
      statuses: this.statuses,
      ...getRootStore<Stores.RootStore>(this)?.tag?.tagSearchOptsToIds(this.tags),
    };
  }

  getIsSelected(id: string) {
    return this.selectedIdSet.has(id);
  }

  getResult(id: string) {
    return this.resultsById.get(id);
  }

  getSearchProps() {
    return derefMobx({
      collectionTitle: this.collectionTitle,
      collectionTitleMode: this.collectionTitleMode,
      completedAtEnd: this.completedAtEnd,
      completedAtMode: this.completedAtMode,
      completedAtStart: this.completedAtStart,
      dateCreatedEnd: this.dateCreatedEnd,
      dateCreatedMode: this.dateCreatedMode,
      dateCreatedStart: this.dateCreatedStart,
      fileCount: this.fileCount,
      fileCountMode: this.fileCountMode,
      filePath: this.filePath,
      filePathMode: this.filePathMode,
      ids: this.ids,
      isCompleted: this.isCompleted,
      sortValue: this.sortValue,
      startedAtEnd: this.startedAtEnd,
      startedAtMode: this.startedAtMode,
      startedAtStart: this.startedAtStart,
      statuses: this.statuses,
      tags: this.tags,
    });
  }
}

@model("medior/_FileTransformSearch")
export class _FileTransformSearch extends Model({
  afterSize: prop<{ logOp: LogicalOp | ""; value: number }>(() => ({ logOp: "", value: 0 })),
  afterSizeMode: prop<"optional" | "required">("required").withSetter(),
  beforePath: prop<string>(null).withSetter(),
  beforePathMode: prop<"optional" | "required">("required").withSetter(),
  beforeSize: prop<{ logOp: LogicalOp | ""; value: number }>(() => ({ logOp: "", value: 0 })),
  beforeSizeMode: prop<"optional" | "required">("required").withSetter(),
  cachedFilterProps: prop<object | null>(null).withSetter(),
  completedAtEnd: prop<string>("").withSetter(),
  completedAtMode: prop<"optional" | "required">("required").withSetter(),
  completedAtStart: prop<string>("").withSetter(),
  dateCreatedEnd: prop<string>("").withSetter(),
  dateCreatedMode: prop<"optional" | "required">("required").withSetter(),
  dateCreatedStart: prop<string>("").withSetter(),
  forcePages: prop<boolean>(false).withSetter(),
  hasChanges: prop<boolean>(false).withSetter(),
  ids: prop<string[]>(() => []).withSetter(),
  isCompleted: prop<boolean>(false).withSetter(),
  isDeleteModalOpen: prop<boolean>(false).withSetter(),
  isLoading: prop<boolean>(false).withSetter(),
  isPageCountLoading: prop<boolean>(false).withSetter(),
  isSaveModalOpen: prop<boolean>(false).withSetter(),
  isSelecting: prop<boolean>(false).withSetter(),
  loadId: prop<number>(0).withSetter(),
  page: prop<number>(1).withSetter(),
  pageCount: prop<number>(1).withSetter(),
  pageSize: prop<number>(() => getConfig().file.transforms.search.pageSize).withSetter(),
  results: prop<Stores.FileTransform[]>(() => []).withSetter(),
  savedSearches: prop<Stores.SavedSearch[]>(() => []).withSetter(),
  selectedIds: prop<string[]>(() => []).withSetter(),
  selectedSavedSearchId: prop<string>("").withSetter(),
  selectionId: prop<number>(0).withSetter(),
  sortValue: prop<SortMenuProps["value"]>(
    () => getConfig().file.transforms.search.sort,
  ).withSetter(),
  startedAtEnd: prop<string>("").withSetter(),
  startedAtMode: prop<"optional" | "required">("required").withSetter(),
  startedAtStart: prop<string>("").withSetter(),
  status: prop<string>("").withSetter(),
  statusMode: prop<"optional" | "required">("required").withSetter(),
  type: prop<string>("").withSetter(),
  typeMode: prop<"optional" | "required">("required").withSetter(),
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
  cancelLoad() {
    this.loadId += 1;
    this.isLoading = false;
    this.isPageCountLoading = false;
    this.selectionId += 1;
    this.isSelecting = false;
  }

  @modelAction
  cancelSelection() {
    this.selectionId += 1;
    this.isSelecting = false;
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
    const removedIds = new Set(ids);

    this.results = this.results.filter((d) => !removedIds.has(d.id));
  }

  @modelAction
  reset() {
    this.afterSize = { logOp: "", value: 0 };
    this.afterSizeMode = "required";
    this.beforePath = null;
    this.beforePathMode = "required";
    this.beforeSize = { logOp: "", value: 0 };
    this.beforeSizeMode = "required";
    this.cachedFilterProps = null;
    this.completedAtEnd = "";
    this.completedAtMode = "required";
    this.completedAtStart = "";
    this.dateCreatedEnd = "";
    this.dateCreatedMode = "required";
    this.dateCreatedStart = "";
    this.forcePages = false;
    this.hasChanges = false;
    this.ids = [];
    this.isCompleted = false;
    this.isLoading = false;
    this.isPageCountLoading = false;
    this.isSelecting = false;
    this.loadId += 1;
    this.page = 1;
    this.pageCount = 1;
    this.pageSize = getConfig().file.transforms.search.pageSize;
    this.results = [];
    this.selectedIds = [];
    this.selectionId += 1;
    this.sortValue = getConfig().file.transforms.search.sort;
    this.startedAtEnd = "";
    this.startedAtMode = "required";
    this.startedAtStart = "";
    this.status = "";
    this.statusMode = "required";
    this.type = "";
    this.typeMode = "required";
  }

  @modelAction
  toggleSelected(selected: { id: string; isSelected?: boolean }[], withToast = false) {
    if (!selected?.length) return;

    const previous = this.selectedIdSet;
    const next = applySelectionChanges(this.selectedIds, selected);

    this.selectedIds = next;

    if (withToast) {
      const nextSet = new Set(next);
      const addedCount = next.filter((id) => !previous.has(id)).length;
      const removedCount = [...previous].filter((id) => !nextSet.has(id)).length;

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

    const res = await rpc.deleteSavedSearch({ args: { ids: [id] } });

    if (!res.success) throw new Error(res.error);

    await this.loadSavedSearches();

    if (this.selectedSavedSearchId === id) this.setSelectedSavedSearchId("");

    this.setIsDeleteModalOpen(false);
    toast.warn("Saved search deleted");
  });

  @modelFlow
  getShiftSelected = asyncAction(
    async ({ id, selectedIds }: { id: string; selectedIds: string[] }) => {
      const range = getSelectionRange({
        clickedId: id,
        orderedIds: this.results.map((r) => r.id),
        selectedIds,
      });

      if (range) return range;

      const selectionId = this.selectionId + 1;

      this.setSelectionId(selectionId);
      this.setIsSelecting(true);

      try {
        const res = await rpc.getShiftSelectedFileTransform({
          ...this.cachedFilterProps,
          clickedId: id,
          selectedIds,
        });

        if (selectionId !== this.selectionId) return null;

        if (!res.success) throw new Error(res.error);

        return res.data;
      } catch (error) {
        if (selectionId === this.selectionId) throw error;

        return null;
      } finally {
        if (selectionId === this.selectionId) this.setIsSelecting(false);
      }
    },
  );

  @modelFlow
  handleSelect = asyncAction(
    async ({ hasCtrl, hasShift, id }: { hasCtrl: boolean; hasShift: boolean; id: string }) => {
      if (hasShift) {
        const res = await this.getShiftSelected({ id, selectedIds: this.selectedIds });

        if (!res?.success) throw new Error(res.error);

        if (res.data) {
          this.toggleSelected([
            ...res.data.idsToDeselect.map((i) => ({ id: i, isSelected: false })),
            ...res.data.idsToSelect.map((i) => ({ id: i, isSelected: true })),
          ]);
        }
      } else if (hasCtrl) {
        this.toggleSelected([{ id, isSelected: !this.getIsSelected(id) }]);
      } else if (this.selectedIds.length === 1 && this.getIsSelected(id)) {
        this.setSelectedIds([]);
      } else {
        this.setSelectedIds([id]);
      }
    },
  );

  @modelFlow
  selectAllInQuery = asyncAction(async () => {
    const filterProps = this.cachedFilterProps ?? this.getFilterProps();
    const selectionId = this.selectionId + 1;

    this.setSelectionId(selectionId);
    this.setIsSelecting(true);

    try {
      const countRes = await rpc.getFilteredFileTransformCount({
        ...filterProps,
        curMaxPage: this.pageCount,
        forcePages: this.forcePages,
        page: this.page,
        pageSize: this.pageSize,
        withFull: true,
      });

      if (selectionId !== this.selectionId) return null;

      if (!countRes.success) throw new Error(countRes.error);

      if (countRes.data.count === 0) return 0;

      const res = await rpc.listFilteredFileTransform({
        ...filterProps,
        forcePages: this.forcePages,
        page: 1,
        pageSize: countRes.data.count,
        select: { _id: 1 },
      });

      if (selectionId !== this.selectionId) return null;

      if (!res.success) throw new Error(res.error);

      this.toggleSelected(res.data.map(({ id }) => ({ id, isSelected: true })));

      return res.data.length;
    } catch (error) {
      if (selectionId === this.selectionId) throw error;

      return null;
    } finally {
      if (selectionId === this.selectionId) this.setIsSelecting(false);
    }
  });

  @modelFlow
  loadFiltered = asyncAction(
    async ({
      noCache,
      page,
      toLastPage,
      withFullCount,
    }: {
      noCache?: boolean;
      page?: number;
      toLastPage?: boolean;
      withFullCount?: boolean;
    } = {}) => {
      const loadId = this.loadId + 1;

      this.setLoadId(loadId);
      this.setIsLoading(true);
      this.setIsPageCountLoading(true);

      try {
        const shouldCacheFilterProps = noCache || !this.cachedFilterProps;
        const filterProps = shouldCacheFilterProps ? this.getFilterProps() : this.cachedFilterProps;

        // A selection still running over the previous query would add its results to the new one.
        if (shouldCacheFilterProps) this.cancelSelection();

        const exactCount = withFullCount || toLastPage;
        let nextPageCount = this.pageCount;

        if (exactCount) {
          const countRes = await rpc.getFilteredFileTransformCount({
            ...filterProps,
            curMaxPage: this.pageCount,
            forcePages: this.forcePages,
            page,
            pageSize: this.pageSize,
            withFull: true,
          });

          if (loadId !== this.loadId) return;

          if (!countRes.success) throw new Error(countRes.error);

          nextPageCount = countRes.data.pageCount;
        }

        const newPage = toLastPage
          ? Math.max(nextPageCount, 1)
          : exactCount
            ? Math.min(page ?? this.page, Math.max(nextPageCount, 1))
            : (page ?? this.page);

        const itemsRes = await rpc.listFilteredFileTransform({
          ...filterProps,
          forcePages: this.forcePages,
          page: newPage,
          pageSize: this.pageSize,
        });

        if (loadId !== this.loadId) return;

        if (!itemsRes.success) throw new Error(itemsRes.error);

        let items = itemsRes.data;

        this.setResults(items.map((result) => new Stores.FileTransform(result)));

        if (shouldCacheFilterProps) this.setCachedFilterProps(derefMobx(filterProps));

        if (exactCount) {
          this.setPageCount(nextPageCount);
          this.setIsPageCountLoading(false);
        }

        this.setPage(newPage);
        this.setIsLoading(false);

        if (noCache) this.setHasChanges(false);

        if (!exactCount) {
          (async () => {
            try {
              const countRes = await rpc.getFilteredFileTransformCount({
                ...filterProps,
                curMaxPage: this.pageCount,
                forcePages: this.forcePages,
                page: newPage,
                pageSize: this.pageSize,
                withFull: false,
              });

              if (loadId !== this.loadId) return;

              this.setIsPageCountLoading(false);

              if (!countRes.success) console.error(countRes.error);
              else this.setPageCount(countRes.data.pageCount);
            } catch (error) {
              if (loadId !== this.loadId) return;

              this.setIsPageCountLoading(false);
              console.error(error);
            }
          })();
        }

        return items;
      } catch (error) {
        if (loadId !== this.loadId) return;

        this.setIsLoading(false);
        this.setIsPageCountLoading(false);

        throw error;
      }
    },
  );

  @modelFlow
  loadSavedSearches = asyncAction(async () => {
    const res = await rpc.listSavedSearch({
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
    let res: Awaited<ReturnType<typeof rpc.createSavedSearch | typeof rpc.updateSavedSearch>>;

    if (selected)
      res = await rpc.updateSavedSearch({
        args: { id: selected.id, updates: { filterProps, label: trimmedLabel } },
      });
    else if (existing)
      res = await rpc.updateSavedSearch({
        args: { id: existing.id, updates: { filterProps } },
      });
    else
      res = await rpc.createSavedSearch({
        args: {
          dateCreated: dayjs().toISOString(),
          filterProps,
          label: trimmedLabel,
          searchType: "FileTransform",
        },
      });

    if (!res.success) throw new Error(res.error);

    await this.loadSavedSearches();
    this.setSelectedSavedSearchId(selected?.id ?? existing?.id ?? res.data.id);
    this.setIsSaveModalOpen(false);
    toast.success(selected || existing ? "Saved search updated" : "Saved search created");

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

  @computed({ keepAlive: true })
  get resultsById() {
    return new Map(this.results.map((result) => [result.id, result]));
  }

  @computed({ keepAlive: true })
  get selectedIdSet() {
    return new Set(this.selectedIds);
  }

  /* DYNAMIC GETTERS */
  getCachedFilterProps() {
    if (!this.cachedFilterProps) this.setCachedFilterProps(derefMobx(this.getFilterProps()));

    return this.cachedFilterProps;
  }

  getFilterProps() {
    return {
      afterSize: this.afterSize,
      afterSizeMode: this.afterSizeMode,
      beforePath: this.beforePath,
      beforePathMode: this.beforePathMode,
      beforeSize: this.beforeSize,
      beforeSizeMode: this.beforeSizeMode,
      completedAtEnd: this.completedAtEnd,
      completedAtMode: this.completedAtMode,
      completedAtStart: this.completedAtStart,
      dateCreatedEnd: this.dateCreatedEnd,
      dateCreatedMode: this.dateCreatedMode,
      dateCreatedStart: this.dateCreatedStart,
      ids: this.ids,
      isCompleted: this.isCompleted,
      sortValue: this.sortValue,
      startedAtEnd: this.startedAtEnd,
      startedAtMode: this.startedAtMode,
      startedAtStart: this.startedAtStart,
      status: this.status,
      statusMode: this.statusMode,
      type: this.type,
      typeMode: this.typeMode,
    };
  }

  getIsSelected(id: string) {
    return this.selectedIdSet.has(id);
  }

  getResult(id: string) {
    return this.resultsById.get(id);
  }

  getSearchProps() {
    return derefMobx({
      afterSize: this.afterSize,
      afterSizeMode: this.afterSizeMode,
      beforePath: this.beforePath,
      beforePathMode: this.beforePathMode,
      beforeSize: this.beforeSize,
      beforeSizeMode: this.beforeSizeMode,
      completedAtEnd: this.completedAtEnd,
      completedAtMode: this.completedAtMode,
      completedAtStart: this.completedAtStart,
      dateCreatedEnd: this.dateCreatedEnd,
      dateCreatedMode: this.dateCreatedMode,
      dateCreatedStart: this.dateCreatedStart,
      ids: this.ids,
      isCompleted: this.isCompleted,
      sortValue: this.sortValue,
      startedAtEnd: this.startedAtEnd,
      startedAtMode: this.startedAtMode,
      startedAtStart: this.startedAtStart,
      status: this.status,
      statusMode: this.statusMode,
      type: this.type,
      typeMode: this.typeMode,
    });
  }
}

@model("medior/_MediaProgramSearch")
export class _MediaProgramSearch extends Model({
  cachedFilterProps: prop<object | null>(null).withSetter(),
  dateCreatedEnd: prop<string>("").withSetter(),
  dateCreatedMode: prop<"optional" | "required">("required").withSetter(),
  dateCreatedStart: prop<string>("").withSetter(),
  dateLastWatchedEnd: prop<string>("").withSetter(),
  dateLastWatchedMode: prop<"optional" | "required">("required").withSetter(),
  dateLastWatchedStart: prop<string>("").withSetter(),
  dateModifiedEnd: prop<string>("").withSetter(),
  dateModifiedMode: prop<"optional" | "required">("required").withSetter(),
  dateModifiedStart: prop<string>("").withSetter(),
  fileCount: prop<{ logOp: LogicalOp | ""; value: number }>(() => ({ logOp: "", value: 0 })),
  fileCountMode: prop<"optional" | "required">("required").withSetter(),
  forcePages: prop<boolean>(false).withSetter(),
  genres: prop<Stores.TagOption[]>(() => []).withSetter(),
  hasChanges: prop<boolean>(false).withSetter(),
  ids: prop<string[]>(() => []).withSetter(),
  isDeleteModalOpen: prop<boolean>(false).withSetter(),
  isLoading: prop<boolean>(false).withSetter(),
  isPageCountLoading: prop<boolean>(false).withSetter(),
  isRewatching: prop<boolean>(null).withSetter(),
  isSaveModalOpen: prop<boolean>(false).withSetter(),
  isSelecting: prop<boolean>(false).withSetter(),
  languages: prop<string[]>(() => []).withSetter(),
  loadId: prop<number>(0).withSetter(),
  maxYear: prop<number>(null).withSetter(),
  mediums: prop<string[]>(() => []).withSetter(),
  minYear: prop<number>(null).withSetter(),
  name: prop<string>("").withSetter(),
  nameMode: prop<"optional" | "required">("required").withSetter(),
  page: prop<number>(1).withSetter(),
  pageCount: prop<number>(1).withSetter(),
  pageSize: prop<number>(() => getConfig().mediaPrograms.manager.search.pageSize).withSetter(),
  rating: prop<{ logOp: LogicalOp | ""; value: number }>(() => ({ logOp: "", value: 0 })),
  ratingMode: prop<"optional" | "required">("required").withSetter(),
  results: prop<Stores.MediaProgram[]>(() => []).withSetter(),
  savedSearches: prop<Stores.SavedSearch[]>(() => []).withSetter(),
  selectedIds: prop<string[]>(() => []).withSetter(),
  selectedSavedSearchId: prop<string>("").withSetter(),
  selectionId: prop<number>(0).withSetter(),
  sortValue: prop<SortMenuProps["value"]>(
    () => getConfig().mediaPrograms.manager.search.sort,
  ).withSetter(),
  tags: prop<Stores.TagOption[]>(() => []).withSetter(),
  types: prop<string[]>(() => []).withSetter(),
  watchStatuses: prop<string[]>(() => []).withSetter(),
  yearMode: prop<"optional" | "required">("required").withSetter(),
}) {
  onInit() {
    autoBind(this);

    reaction(
      () => this.getFilterProps(),
      () => this.setHasChanges(true),
    );
  }

  /* STANDARD ACTIONS */
  @modelAction
  _addResult(result: ModelCreationData<Stores.MediaProgram>) {
    this.results.push(new Stores.MediaProgram(result));
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
  cancelLoad() {
    this.loadId += 1;
    this.isLoading = false;
    this.isPageCountLoading = false;
    this.selectionId += 1;
    this.isSelecting = false;
  }

  @modelAction
  cancelSelection() {
    this.selectionId += 1;
    this.isSelecting = false;
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
    const removedIds = new Set(ids);

    this.results = this.results.filter((d) => !removedIds.has(d.id));
  }

  @modelAction
  reset() {
    this.cachedFilterProps = null;
    this.dateCreatedEnd = "";
    this.dateCreatedMode = "required";
    this.dateCreatedStart = "";
    this.dateLastWatchedEnd = "";
    this.dateLastWatchedMode = "required";
    this.dateLastWatchedStart = "";
    this.dateModifiedEnd = "";
    this.dateModifiedMode = "required";
    this.dateModifiedStart = "";
    this.fileCount = { logOp: "", value: 0 };
    this.fileCountMode = "required";
    this.forcePages = false;
    this.genres = [];
    this.hasChanges = false;
    this.ids = [];
    this.isLoading = false;
    this.isPageCountLoading = false;
    this.isRewatching = null;
    this.isSelecting = false;
    this.languages = [];
    this.loadId += 1;
    this.maxYear = null;
    this.mediums = [];
    this.minYear = null;
    this.name = "";
    this.nameMode = "required";
    this.page = 1;
    this.pageCount = 1;
    this.pageSize = getConfig().mediaPrograms.manager.search.pageSize;
    this.rating = { logOp: "", value: 0 };
    this.ratingMode = "required";
    this.results = [];
    this.selectedIds = [];
    this.selectionId += 1;
    this.sortValue = getConfig().mediaPrograms.manager.search.sort;
    this.tags = [];
    this.types = [];
    this.watchStatuses = [];
    this.yearMode = "required";
  }

  @modelAction
  toggleSelected(selected: { id: string; isSelected?: boolean }[], withToast = false) {
    if (!selected?.length) return;

    const previous = this.selectedIdSet;
    const next = applySelectionChanges(this.selectedIds, selected);

    this.selectedIds = next;

    if (withToast) {
      const nextSet = new Set(next);
      const addedCount = next.filter((id) => !previous.has(id)).length;
      const removedCount = [...previous].filter((id) => !nextSet.has(id)).length;

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

    const res = await rpc.deleteSavedSearch({ args: { ids: [id] } });

    if (!res.success) throw new Error(res.error);

    await this.loadSavedSearches();

    if (this.selectedSavedSearchId === id) this.setSelectedSavedSearchId("");

    this.setIsDeleteModalOpen(false);
    toast.warn("Saved search deleted");
  });

  @modelFlow
  getShiftSelected = asyncAction(
    async ({ id, selectedIds }: { id: string; selectedIds: string[] }) => {
      const range = getSelectionRange({
        clickedId: id,
        orderedIds: this.results.map((r) => r.id),
        selectedIds,
      });

      if (range) return range;

      const selectionId = this.selectionId + 1;

      this.setSelectionId(selectionId);
      this.setIsSelecting(true);

      try {
        const res = await rpc.getShiftSelectedMediaProgram({
          ...this.cachedFilterProps,
          clickedId: id,
          selectedIds,
        });

        if (selectionId !== this.selectionId) return null;

        if (!res.success) throw new Error(res.error);

        return res.data;
      } catch (error) {
        if (selectionId === this.selectionId) throw error;

        return null;
      } finally {
        if (selectionId === this.selectionId) this.setIsSelecting(false);
      }
    },
  );

  @modelFlow
  handleSelect = asyncAction(
    async ({ hasCtrl, hasShift, id }: { hasCtrl: boolean; hasShift: boolean; id: string }) => {
      if (hasShift) {
        const res = await this.getShiftSelected({ id, selectedIds: this.selectedIds });

        if (!res?.success) throw new Error(res.error);

        if (res.data) {
          this.toggleSelected([
            ...res.data.idsToDeselect.map((i) => ({ id: i, isSelected: false })),
            ...res.data.idsToSelect.map((i) => ({ id: i, isSelected: true })),
          ]);
        }
      } else if (hasCtrl) {
        this.toggleSelected([{ id, isSelected: !this.getIsSelected(id) }]);
      } else if (this.selectedIds.length === 1 && this.getIsSelected(id)) {
        this.setSelectedIds([]);
      } else {
        this.setSelectedIds([id]);
      }
    },
  );

  @modelFlow
  selectAllInQuery = asyncAction(async () => {
    const filterProps = this.cachedFilterProps ?? this.getFilterProps();
    const selectionId = this.selectionId + 1;

    this.setSelectionId(selectionId);
    this.setIsSelecting(true);

    try {
      const countRes = await rpc.getFilteredMediaProgramCount({
        ...filterProps,
        curMaxPage: this.pageCount,
        forcePages: this.forcePages,
        page: this.page,
        pageSize: this.pageSize,
        withFull: true,
      });

      if (selectionId !== this.selectionId) return null;

      if (!countRes.success) throw new Error(countRes.error);

      if (countRes.data.count === 0) return 0;

      const res = await rpc.listFilteredMediaProgram({
        ...filterProps,
        forcePages: this.forcePages,
        page: 1,
        pageSize: countRes.data.count,
        select: { _id: 1 },
      });

      if (selectionId !== this.selectionId) return null;

      if (!res.success) throw new Error(res.error);

      this.toggleSelected(res.data.map(({ id }) => ({ id, isSelected: true })));

      return res.data.length;
    } catch (error) {
      if (selectionId === this.selectionId) throw error;

      return null;
    } finally {
      if (selectionId === this.selectionId) this.setIsSelecting(false);
    }
  });

  @modelFlow
  loadFiltered = asyncAction(
    async ({
      noCache,
      page,
      toLastPage,
      withFullCount,
    }: {
      noCache?: boolean;
      page?: number;
      toLastPage?: boolean;
      withFullCount?: boolean;
    } = {}) => {
      const loadId = this.loadId + 1;

      this.setLoadId(loadId);
      this.setIsLoading(true);
      this.setIsPageCountLoading(true);

      try {
        const shouldCacheFilterProps = noCache || !this.cachedFilterProps;
        const filterProps = shouldCacheFilterProps ? this.getFilterProps() : this.cachedFilterProps;

        // A selection still running over the previous query would add its results to the new one.
        if (shouldCacheFilterProps) this.cancelSelection();

        const exactCount = withFullCount || toLastPage;
        let nextPageCount = this.pageCount;

        if (exactCount) {
          const countRes = await rpc.getFilteredMediaProgramCount({
            ...filterProps,
            curMaxPage: this.pageCount,
            forcePages: this.forcePages,
            page,
            pageSize: this.pageSize,
            withFull: true,
          });

          if (loadId !== this.loadId) return;

          if (!countRes.success) throw new Error(countRes.error);

          nextPageCount = countRes.data.pageCount;
        }

        const newPage = toLastPage
          ? Math.max(nextPageCount, 1)
          : exactCount
            ? Math.min(page ?? this.page, Math.max(nextPageCount, 1))
            : (page ?? this.page);

        const itemsRes = await rpc.listFilteredMediaProgram({
          ...filterProps,
          forcePages: this.forcePages,
          page: newPage,
          pageSize: this.pageSize,
        });

        if (loadId !== this.loadId) return;

        if (!itemsRes.success) throw new Error(itemsRes.error);

        let items = itemsRes.data;

        const tagIds = [...new Set(items.flatMap((item) => [item.tagIds, item.genreIds].flat()))];

        if (tagIds.length) {
          const tagRes = await rpc.listTag({ filter: { id: tagIds } });

          if (loadId !== this.loadId) return;

          if (!tagRes.success) throw new Error(tagRes.error);

          const selectTags = makeTagSelector(tagRes.data);

          items = items.map((item) => ({
            ...item,
            genres: selectTags(item.genreIds),
            tags: selectTags(item.tagIds),
          }));
        }

        this.setResults(items.map((result) => new Stores.MediaProgram(result)));

        if (shouldCacheFilterProps) this.setCachedFilterProps(derefMobx(filterProps));

        if (exactCount) {
          this.setPageCount(nextPageCount);
          this.setIsPageCountLoading(false);
        }

        this.setPage(newPage);
        this.setIsLoading(false);

        if (noCache) this.setHasChanges(false);

        if (!exactCount) {
          (async () => {
            try {
              const countRes = await rpc.getFilteredMediaProgramCount({
                ...filterProps,
                curMaxPage: this.pageCount,
                forcePages: this.forcePages,
                page: newPage,
                pageSize: this.pageSize,
                withFull: false,
              });

              if (loadId !== this.loadId) return;

              this.setIsPageCountLoading(false);

              if (!countRes.success) console.error(countRes.error);
              else this.setPageCount(countRes.data.pageCount);
            } catch (error) {
              if (loadId !== this.loadId) return;

              this.setIsPageCountLoading(false);
              console.error(error);
            }
          })();
        }

        return items;
      } catch (error) {
        if (loadId !== this.loadId) return;

        this.setIsLoading(false);
        this.setIsPageCountLoading(false);

        throw error;
      }
    },
  );

  @modelFlow
  loadSavedSearches = asyncAction(async () => {
    const res = await rpc.listSavedSearch({
      args: {
        filter: { searchType: "MediaProgram" },
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
    let res: Awaited<ReturnType<typeof rpc.createSavedSearch | typeof rpc.updateSavedSearch>>;

    if (selected)
      res = await rpc.updateSavedSearch({
        args: { id: selected.id, updates: { filterProps, label: trimmedLabel } },
      });
    else if (existing)
      res = await rpc.updateSavedSearch({
        args: { id: existing.id, updates: { filterProps } },
      });
    else
      res = await rpc.createSavedSearch({
        args: {
          dateCreated: dayjs().toISOString(),
          filterProps,
          label: trimmedLabel,
          searchType: "MediaProgram",
        },
      });

    if (!res.success) throw new Error(res.error);

    await this.loadSavedSearches();
    this.setSelectedSavedSearchId(selected?.id ?? existing?.id ?? res.data.id);
    this.setIsSaveModalOpen(false);
    toast.success(selected || existing ? "Saved search updated" : "Saved search created");

    return res.data;
  });

  /* GETTERS */
  @computed
  get numOfFilters() {
    return (
      (!isDeepEqual(this.dateCreatedEnd, "") ? 1 : 0) +
      (!isDeepEqual(this.dateCreatedStart, "") ? 1 : 0) +
      (!isDeepEqual(this.dateLastWatchedEnd, "") ? 1 : 0) +
      (!isDeepEqual(this.dateLastWatchedStart, "") ? 1 : 0) +
      (!isDeepEqual(this.dateModifiedEnd, "") ? 1 : 0) +
      (!isDeepEqual(this.dateModifiedStart, "") ? 1 : 0) +
      (!isDeepEqual(this.fileCount, { logOp: "", value: 0 }) ? 1 : 0) +
      (!isDeepEqual(this.genres, []) ? 1 : 0) +
      (!isDeepEqual(this.ids, []) ? 1 : 0) +
      (!isDeepEqual(this.isRewatching, null) ? 1 : 0) +
      (!isDeepEqual(this.languages, []) ? 1 : 0) +
      (!isDeepEqual(this.maxYear, null) ? 1 : 0) +
      (!isDeepEqual(this.mediums, []) ? 1 : 0) +
      (!isDeepEqual(this.minYear, null) ? 1 : 0) +
      (!isDeepEqual(this.name, "") ? 1 : 0) +
      (!isDeepEqual(this.rating, { logOp: "", value: 0 }) ? 1 : 0) +
      (!isDeepEqual(this.sortValue, getConfig().mediaPrograms.manager.search.sort) ? 1 : 0) +
      (!isDeepEqual(this.tags, []) ? 1 : 0) +
      (!isDeepEqual(this.types, []) ? 1 : 0) +
      (!isDeepEqual(this.watchStatuses, []) ? 1 : 0)
    );
  }

  @computed({ keepAlive: true })
  get resultsById() {
    return new Map(this.results.map((result) => [result.id, result]));
  }

  @computed({ keepAlive: true })
  get selectedIdSet() {
    return new Set(this.selectedIds);
  }

  /* DYNAMIC GETTERS */
  getCachedFilterProps() {
    if (!this.cachedFilterProps) this.setCachedFilterProps(derefMobx(this.getFilterProps()));

    return this.cachedFilterProps;
  }

  getFilterProps() {
    return {
      dateCreatedEnd: this.dateCreatedEnd,
      dateCreatedMode: this.dateCreatedMode,
      dateCreatedStart: this.dateCreatedStart,
      dateLastWatchedEnd: this.dateLastWatchedEnd,
      dateLastWatchedMode: this.dateLastWatchedMode,
      dateLastWatchedStart: this.dateLastWatchedStart,
      dateModifiedEnd: this.dateModifiedEnd,
      dateModifiedMode: this.dateModifiedMode,
      dateModifiedStart: this.dateModifiedStart,
      fileCount: this.fileCount,
      fileCountMode: this.fileCountMode,
      ...getRootStore<Stores.RootStore>(this)?.tag?.tagSearchOptsToIds(this.genres, false, "Genre"),
      ids: this.ids,
      isRewatching: this.isRewatching,
      languages: this.languages,
      maxYear: this.maxYear,
      mediums: this.mediums,
      minYear: this.minYear,
      name: this.name,
      nameMode: this.nameMode,
      rating: this.rating,
      ratingMode: this.ratingMode,
      sortValue: this.sortValue,
      ...getRootStore<Stores.RootStore>(this)?.tag?.tagSearchOptsToIds(this.tags),
      types: this.types,
      watchStatuses: this.watchStatuses,
      yearMode: this.yearMode,
    };
  }

  getIsSelected(id: string) {
    return this.selectedIdSet.has(id);
  }

  getResult(id: string) {
    return this.resultsById.get(id);
  }

  getSearchProps() {
    return derefMobx({
      dateCreatedEnd: this.dateCreatedEnd,
      dateCreatedMode: this.dateCreatedMode,
      dateCreatedStart: this.dateCreatedStart,
      dateLastWatchedEnd: this.dateLastWatchedEnd,
      dateLastWatchedMode: this.dateLastWatchedMode,
      dateLastWatchedStart: this.dateLastWatchedStart,
      dateModifiedEnd: this.dateModifiedEnd,
      dateModifiedMode: this.dateModifiedMode,
      dateModifiedStart: this.dateModifiedStart,
      fileCount: this.fileCount,
      fileCountMode: this.fileCountMode,
      genres: this.genres,
      ids: this.ids,
      isRewatching: this.isRewatching,
      languages: this.languages,
      maxYear: this.maxYear,
      mediums: this.mediums,
      minYear: this.minYear,
      name: this.name,
      nameMode: this.nameMode,
      rating: this.rating,
      ratingMode: this.ratingMode,
      sortValue: this.sortValue,
      tags: this.tags,
      types: this.types,
      watchStatuses: this.watchStatuses,
      yearMode: this.yearMode,
    });
  }
}

@model("medior/_SavedImportConfigSearch")
export class _SavedImportConfigSearch extends Model({
  cachedFilterProps: prop<object | null>(null).withSetter(),
  dateModifiedEnd: prop<string>("").withSetter(),
  dateModifiedMode: prop<"optional" | "required">("required").withSetter(),
  dateModifiedStart: prop<string>("").withSetter(),
  folderPath: prop<string>(""),
  forcePages: prop<boolean>(false).withSetter(),
  hasChanges: prop<boolean>(false).withSetter(),
  ids: prop<string[]>(() => []).withSetter(),
  isDeleteModalOpen: prop<boolean>(false).withSetter(),
  isLoading: prop<boolean>(false).withSetter(),
  isPageCountLoading: prop<boolean>(false).withSetter(),
  isSaveModalOpen: prop<boolean>(false).withSetter(),
  isSelecting: prop<boolean>(false).withSetter(),
  label: prop<string>(""),
  loadId: prop<number>(0).withSetter(),
  page: prop<number>(1).withSetter(),
  pageCount: prop<number>(1).withSetter(),
  pageSize: prop<number>(20).withSetter(),
  results: prop<Stores.SavedImportConfig[]>(() => []).withSetter(),
  savedSearches: prop<Stores.SavedSearch[]>(() => []).withSetter(),
  selectedIds: prop<string[]>(() => []).withSetter(),
  selectedSavedSearchId: prop<string>("").withSetter(),
  selectionId: prop<number>(0).withSetter(),
  sortValue: prop<SortMenuProps["value"]>(() => ({
    isDesc: true,
    key: "dateModified",
  })).withSetter(),
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
  cancelLoad() {
    this.loadId += 1;
    this.isLoading = false;
    this.isPageCountLoading = false;
    this.selectionId += 1;
    this.isSelecting = false;
  }

  @modelAction
  cancelSelection() {
    this.selectionId += 1;
    this.isSelecting = false;
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
    const removedIds = new Set(ids);

    this.results = this.results.filter((d) => !removedIds.has(d.id));
  }

  @modelAction
  reset() {
    this.cachedFilterProps = null;
    this.dateModifiedEnd = "";
    this.dateModifiedMode = "required";
    this.dateModifiedStart = "";
    this.folderPath = "";
    this.forcePages = false;
    this.hasChanges = false;
    this.ids = [];
    this.isLoading = false;
    this.isPageCountLoading = false;
    this.isSelecting = false;
    this.label = "";
    this.loadId += 1;
    this.page = 1;
    this.pageCount = 1;
    this.pageSize = 20;
    this.results = [];
    this.selectedIds = [];
    this.selectionId += 1;
    this.sortValue = { isDesc: true, key: "dateModified" };
  }

  @modelAction
  toggleSelected(selected: { id: string; isSelected?: boolean }[], withToast = false) {
    if (!selected?.length) return;

    const previous = this.selectedIdSet;
    const next = applySelectionChanges(this.selectedIds, selected);

    this.selectedIds = next;

    if (withToast) {
      const nextSet = new Set(next);
      const addedCount = next.filter((id) => !previous.has(id)).length;
      const removedCount = [...previous].filter((id) => !nextSet.has(id)).length;

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

    const res = await rpc.deleteSavedSearch({ args: { ids: [id] } });

    if (!res.success) throw new Error(res.error);

    await this.loadSavedSearches();

    if (this.selectedSavedSearchId === id) this.setSelectedSavedSearchId("");

    this.setIsDeleteModalOpen(false);
    toast.warn("Saved search deleted");
  });

  @modelFlow
  getShiftSelected = asyncAction(
    async ({ id, selectedIds }: { id: string; selectedIds: string[] }) => {
      const range = getSelectionRange({
        clickedId: id,
        orderedIds: this.results.map((r) => r.id),
        selectedIds,
      });

      if (range) return range;

      const selectionId = this.selectionId + 1;

      this.setSelectionId(selectionId);
      this.setIsSelecting(true);

      try {
        const res = await rpc.getShiftSelectedSavedImportConfig({
          ...this.cachedFilterProps,
          clickedId: id,
          selectedIds,
        });

        if (selectionId !== this.selectionId) return null;

        if (!res.success) throw new Error(res.error);

        return res.data;
      } catch (error) {
        if (selectionId === this.selectionId) throw error;

        return null;
      } finally {
        if (selectionId === this.selectionId) this.setIsSelecting(false);
      }
    },
  );

  @modelFlow
  handleSelect = asyncAction(
    async ({ hasCtrl, hasShift, id }: { hasCtrl: boolean; hasShift: boolean; id: string }) => {
      if (hasShift) {
        const res = await this.getShiftSelected({ id, selectedIds: this.selectedIds });

        if (!res?.success) throw new Error(res.error);

        if (res.data) {
          this.toggleSelected([
            ...res.data.idsToDeselect.map((i) => ({ id: i, isSelected: false })),
            ...res.data.idsToSelect.map((i) => ({ id: i, isSelected: true })),
          ]);
        }
      } else if (hasCtrl) {
        this.toggleSelected([{ id, isSelected: !this.getIsSelected(id) }]);
      } else if (this.selectedIds.length === 1 && this.getIsSelected(id)) {
        this.setSelectedIds([]);
      } else {
        this.setSelectedIds([id]);
      }
    },
  );

  @modelFlow
  selectAllInQuery = asyncAction(async () => {
    const filterProps = this.cachedFilterProps ?? this.getFilterProps();
    const selectionId = this.selectionId + 1;

    this.setSelectionId(selectionId);
    this.setIsSelecting(true);

    try {
      const countRes = await rpc.getFilteredSavedImportConfigCount({
        ...filterProps,
        curMaxPage: this.pageCount,
        forcePages: this.forcePages,
        page: this.page,
        pageSize: this.pageSize,
        withFull: true,
      });

      if (selectionId !== this.selectionId) return null;

      if (!countRes.success) throw new Error(countRes.error);

      if (countRes.data.count === 0) return 0;

      const res = await rpc.listFilteredSavedImportConfig({
        ...filterProps,
        forcePages: this.forcePages,
        page: 1,
        pageSize: countRes.data.count,
        select: { _id: 1 },
      });

      if (selectionId !== this.selectionId) return null;

      if (!res.success) throw new Error(res.error);

      this.toggleSelected(res.data.map(({ id }) => ({ id, isSelected: true })));

      return res.data.length;
    } catch (error) {
      if (selectionId === this.selectionId) throw error;

      return null;
    } finally {
      if (selectionId === this.selectionId) this.setIsSelecting(false);
    }
  });

  @modelFlow
  loadFiltered = asyncAction(
    async ({
      noCache,
      page,
      toLastPage,
      withFullCount,
    }: {
      noCache?: boolean;
      page?: number;
      toLastPage?: boolean;
      withFullCount?: boolean;
    } = {}) => {
      const loadId = this.loadId + 1;

      this.setLoadId(loadId);
      this.setIsLoading(true);
      this.setIsPageCountLoading(true);

      try {
        const shouldCacheFilterProps = noCache || !this.cachedFilterProps;
        const filterProps = shouldCacheFilterProps ? this.getFilterProps() : this.cachedFilterProps;

        // A selection still running over the previous query would add its results to the new one.
        if (shouldCacheFilterProps) this.cancelSelection();

        const exactCount = withFullCount || toLastPage;
        let nextPageCount = this.pageCount;

        if (exactCount) {
          const countRes = await rpc.getFilteredSavedImportConfigCount({
            ...filterProps,
            curMaxPage: this.pageCount,
            forcePages: this.forcePages,
            page,
            pageSize: this.pageSize,
            withFull: true,
          });

          if (loadId !== this.loadId) return;

          if (!countRes.success) throw new Error(countRes.error);

          nextPageCount = countRes.data.pageCount;
        }

        const newPage = toLastPage
          ? Math.max(nextPageCount, 1)
          : exactCount
            ? Math.min(page ?? this.page, Math.max(nextPageCount, 1))
            : (page ?? this.page);

        const itemsRes = await rpc.listFilteredSavedImportConfig({
          ...filterProps,
          forcePages: this.forcePages,
          page: newPage,
          pageSize: this.pageSize,
        });

        if (loadId !== this.loadId) return;

        if (!itemsRes.success) throw new Error(itemsRes.error);

        let items = itemsRes.data;

        this.setResults(items.map((result) => new Stores.SavedImportConfig(result)));

        if (shouldCacheFilterProps) this.setCachedFilterProps(derefMobx(filterProps));

        if (exactCount) {
          this.setPageCount(nextPageCount);
          this.setIsPageCountLoading(false);
        }

        this.setPage(newPage);
        this.setIsLoading(false);

        if (noCache) this.setHasChanges(false);

        if (!exactCount) {
          (async () => {
            try {
              const countRes = await rpc.getFilteredSavedImportConfigCount({
                ...filterProps,
                curMaxPage: this.pageCount,
                forcePages: this.forcePages,
                page: newPage,
                pageSize: this.pageSize,
                withFull: false,
              });

              if (loadId !== this.loadId) return;

              this.setIsPageCountLoading(false);

              if (!countRes.success) console.error(countRes.error);
              else this.setPageCount(countRes.data.pageCount);
            } catch (error) {
              if (loadId !== this.loadId) return;

              this.setIsPageCountLoading(false);
              console.error(error);
            }
          })();
        }

        return items;
      } catch (error) {
        if (loadId !== this.loadId) return;

        this.setIsLoading(false);
        this.setIsPageCountLoading(false);

        throw error;
      }
    },
  );

  @modelFlow
  loadSavedSearches = asyncAction(async () => {
    const res = await rpc.listSavedSearch({
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
    let res: Awaited<ReturnType<typeof rpc.createSavedSearch | typeof rpc.updateSavedSearch>>;

    if (selected)
      res = await rpc.updateSavedSearch({
        args: { id: selected.id, updates: { filterProps, label: trimmedLabel } },
      });
    else if (existing)
      res = await rpc.updateSavedSearch({
        args: { id: existing.id, updates: { filterProps } },
      });
    else
      res = await rpc.createSavedSearch({
        args: {
          dateCreated: dayjs().toISOString(),
          filterProps,
          label: trimmedLabel,
          searchType: "SavedImportConfig",
        },
      });

    if (!res.success) throw new Error(res.error);

    await this.loadSavedSearches();
    this.setSelectedSavedSearchId(selected?.id ?? existing?.id ?? res.data.id);
    this.setIsSaveModalOpen(false);
    toast.success(selected || existing ? "Saved search updated" : "Saved search created");

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

  @computed({ keepAlive: true })
  get resultsById() {
    return new Map(this.results.map((result) => [result.id, result]));
  }

  @computed({ keepAlive: true })
  get selectedIdSet() {
    return new Set(this.selectedIds);
  }

  /* DYNAMIC GETTERS */
  getCachedFilterProps() {
    if (!this.cachedFilterProps) this.setCachedFilterProps(derefMobx(this.getFilterProps()));

    return this.cachedFilterProps;
  }

  getFilterProps() {
    return {
      dateModifiedEnd: this.dateModifiedEnd,
      dateModifiedMode: this.dateModifiedMode,
      dateModifiedStart: this.dateModifiedStart,
      folderPath: this.folderPath,
      ids: this.ids,
      label: this.label,
      sortValue: this.sortValue,
    };
  }

  getIsSelected(id: string) {
    return this.selectedIdSet.has(id);
  }

  getResult(id: string) {
    return this.resultsById.get(id);
  }

  getSearchProps() {
    return derefMobx({
      dateModifiedEnd: this.dateModifiedEnd,
      dateModifiedMode: this.dateModifiedMode,
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
  aliasMode: prop<"optional" | "required">("required").withSetter(),
  cachedFilterProps: prop<object | null>(null).withSetter(),
  count: prop<{ logOp: LogicalOp | ""; value: number }>(() => ({ logOp: "", value: 0 })),
  countMode: prop<"optional" | "required">("required").withSetter(),
  dateCreatedEnd: prop<string>("").withSetter(),
  dateCreatedMode: prop<"optional" | "required">("required").withSetter(),
  dateCreatedStart: prop<string>("").withSetter(),
  dateModifiedEnd: prop<string>("").withSetter(),
  dateModifiedMode: prop<"optional" | "required">("required").withSetter(),
  dateModifiedStart: prop<string>("").withSetter(),
  dateOfInceptionEnd: prop<string>("").withSetter(),
  dateOfInceptionMode: prop<"optional" | "required">("required").withSetter(),
  dateOfInceptionStart: prop<string>("").withSetter(),
  fileTags: prop<Stores.TagOption[]>(() => []).withSetter(),
  forcePages: prop<boolean>(false).withSetter(),
  hasChanges: prop<boolean>(false).withSetter(),
  hasRegEx: prop<boolean>(null).withSetter(),
  ids: prop<string[]>(() => []).withSetter(),
  isDeleteModalOpen: prop<boolean>(false).withSetter(),
  isLoading: prop<boolean>(false).withSetter(),
  isPageCountLoading: prop<boolean>(false).withSetter(),
  isSaveModalOpen: prop<boolean>(false).withSetter(),
  isSelecting: prop<boolean>(false).withSetter(),
  label: prop<string>("").withSetter(),
  labelMode: prop<"optional" | "required">("required").withSetter(),
  loadId: prop<number>(0).withSetter(),
  numOfChildTags: prop<{ logOp: LogicalOp | ""; value: number }>(() => ({ logOp: "", value: 0 })),
  numOfChildTagsMode: prop<"optional" | "required">("required").withSetter(),
  numOfParentTags: prop<{ logOp: LogicalOp | ""; value: number }>(() => ({ logOp: "", value: 0 })),
  numOfParentTagsMode: prop<"optional" | "required">("required").withSetter(),
  page: prop<number>(1).withSetter(),
  pageCount: prop<number>(1).withSetter(),
  pageSize: prop<number>(() => getConfig().tags.manager.search.pageSize).withSetter(),
  rating: prop<{ logOp: LogicalOp | ""; value: number }>(() => ({ logOp: "", value: 0 })),
  ratingMode: prop<"optional" | "required">("required").withSetter(),
  results: prop<Stores.Tag[]>(() => []).withSetter(),
  savedSearches: prop<Stores.SavedSearch[]>(() => []).withSetter(),
  selectedIds: prop<string[]>(() => []).withSetter(),
  selectedSavedSearchId: prop<string>("").withSetter(),
  selectionId: prop<number>(0).withSetter(),
  size: prop<{ logOp: LogicalOp | ""; value: number }>(() => ({ logOp: "", value: 0 })),
  sizeMode: prop<"optional" | "required">("required").withSetter(),
  sortValue: prop<SortMenuProps["value"]>(() => getConfig().tags.manager.search.sort).withSetter(),
  tags: prop<Stores.TagOption[]>(() => []).withSetter(),
}) {
  onInit() {
    autoBind(this);

    reaction(
      () => this.getFilterProps(),
      () => this.setHasChanges(true),
    );
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
  cancelLoad() {
    this.loadId += 1;
    this.isLoading = false;
    this.isPageCountLoading = false;
    this.selectionId += 1;
    this.isSelecting = false;
  }

  @modelAction
  cancelSelection() {
    this.selectionId += 1;
    this.isSelecting = false;
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
  setNumOfChildTagsOp(val: LogicalOp | "") {
    this.numOfChildTags.logOp = val;

    if (val === "") this.numOfChildTags.value = 0;
  }

  @modelAction
  setNumOfChildTagsValue(val: number) {
    this.numOfChildTags.value = val;
  }

  @modelAction
  setNumOfParentTagsOp(val: LogicalOp | "") {
    this.numOfParentTags.logOp = val;

    if (val === "") this.numOfParentTags.value = 0;
  }

  @modelAction
  setNumOfParentTagsValue(val: number) {
    this.numOfParentTags.value = val;
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
    const removedIds = new Set(ids);

    this.results = this.results.filter((d) => !removedIds.has(d.id));
  }

  @modelAction
  reset() {
    this.alias = "";
    this.aliasMode = "required";
    this.cachedFilterProps = null;
    this.count = { logOp: "", value: 0 };
    this.countMode = "required";
    this.dateCreatedEnd = "";
    this.dateCreatedMode = "required";
    this.dateCreatedStart = "";
    this.dateModifiedEnd = "";
    this.dateModifiedMode = "required";
    this.dateModifiedStart = "";
    this.dateOfInceptionEnd = "";
    this.dateOfInceptionMode = "required";
    this.dateOfInceptionStart = "";
    this.fileTags = [];
    this.forcePages = false;
    this.hasChanges = false;
    this.hasRegEx = null;
    this.ids = [];
    this.isLoading = false;
    this.isPageCountLoading = false;
    this.isSelecting = false;
    this.label = "";
    this.labelMode = "required";
    this.loadId += 1;
    this.numOfChildTags = { logOp: "", value: 0 };
    this.numOfChildTagsMode = "required";
    this.numOfParentTags = { logOp: "", value: 0 };
    this.numOfParentTagsMode = "required";
    this.page = 1;
    this.pageCount = 1;
    this.pageSize = getConfig().tags.manager.search.pageSize;
    this.rating = { logOp: "", value: 0 };
    this.ratingMode = "required";
    this.results = [];
    this.selectedIds = [];
    this.selectionId += 1;
    this.size = { logOp: "", value: 0 };
    this.sizeMode = "required";
    this.sortValue = getConfig().tags.manager.search.sort;
    this.tags = [];
  }

  @modelAction
  toggleSelected(selected: { id: string; isSelected?: boolean }[], withToast = false) {
    if (!selected?.length) return;

    const previous = this.selectedIdSet;
    const next = applySelectionChanges(this.selectedIds, selected);

    this.selectedIds = next;

    if (withToast) {
      const nextSet = new Set(next);
      const addedCount = next.filter((id) => !previous.has(id)).length;
      const removedCount = [...previous].filter((id) => !nextSet.has(id)).length;

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

    const res = await rpc.deleteSavedSearch({ args: { ids: [id] } });

    if (!res.success) throw new Error(res.error);

    await this.loadSavedSearches();

    if (this.selectedSavedSearchId === id) this.setSelectedSavedSearchId("");

    this.setIsDeleteModalOpen(false);
    toast.warn("Saved search deleted");
  });

  @modelFlow
  getShiftSelected = asyncAction(
    async ({ id, selectedIds }: { id: string; selectedIds: string[] }) => {
      const range = getSelectionRange({
        clickedId: id,
        orderedIds: this.results.map((r) => r.id),
        selectedIds,
      });

      if (range) return range;

      const selectionId = this.selectionId + 1;

      this.setSelectionId(selectionId);
      this.setIsSelecting(true);

      try {
        const res = await rpc.getShiftSelectedTag({
          ...this.cachedFilterProps,
          clickedId: id,
          selectedIds,
        });

        if (selectionId !== this.selectionId) return null;

        if (!res.success) throw new Error(res.error);

        return res.data;
      } catch (error) {
        if (selectionId === this.selectionId) throw error;

        return null;
      } finally {
        if (selectionId === this.selectionId) this.setIsSelecting(false);
      }
    },
  );

  @modelFlow
  handleSelect = asyncAction(
    async ({ hasCtrl, hasShift, id }: { hasCtrl: boolean; hasShift: boolean; id: string }) => {
      if (hasShift) {
        const res = await this.getShiftSelected({ id, selectedIds: this.selectedIds });

        if (!res?.success) throw new Error(res.error);

        if (res.data) {
          this.toggleSelected([
            ...res.data.idsToDeselect.map((i) => ({ id: i, isSelected: false })),
            ...res.data.idsToSelect.map((i) => ({ id: i, isSelected: true })),
          ]);
        }
      } else if (hasCtrl) {
        this.toggleSelected([{ id, isSelected: !this.getIsSelected(id) }]);
      } else if (this.selectedIds.length === 1 && this.getIsSelected(id)) {
        this.setSelectedIds([]);
      } else {
        this.setSelectedIds([id]);
      }
    },
  );

  @modelFlow
  selectAllInQuery = asyncAction(async () => {
    const filterProps = this.cachedFilterProps ?? this.getFilterProps();
    const selectionId = this.selectionId + 1;

    this.setSelectionId(selectionId);
    this.setIsSelecting(true);

    try {
      const countRes = await rpc.getFilteredTagCount({
        ...filterProps,
        curMaxPage: this.pageCount,
        forcePages: this.forcePages,
        page: this.page,
        pageSize: this.pageSize,
        withFull: true,
      });

      if (selectionId !== this.selectionId) return null;

      if (!countRes.success) throw new Error(countRes.error);

      if (countRes.data.count === 0) return 0;

      const res = await rpc.listFilteredTag({
        ...filterProps,
        forcePages: this.forcePages,
        page: 1,
        pageSize: countRes.data.count,
        select: { _id: 1 },
      });

      if (selectionId !== this.selectionId) return null;

      if (!res.success) throw new Error(res.error);

      this.toggleSelected(res.data.map(({ id }) => ({ id, isSelected: true })));

      return res.data.length;
    } catch (error) {
      if (selectionId === this.selectionId) throw error;

      return null;
    } finally {
      if (selectionId === this.selectionId) this.setIsSelecting(false);
    }
  });

  @modelFlow
  loadFiltered = asyncAction(
    async ({
      noCache,
      page,
      toLastPage,
      withFullCount,
    }: {
      noCache?: boolean;
      page?: number;
      toLastPage?: boolean;
      withFullCount?: boolean;
    } = {}) => {
      const loadId = this.loadId + 1;

      this.setLoadId(loadId);
      this.setIsLoading(true);
      this.setIsPageCountLoading(true);

      try {
        const shouldCacheFilterProps = noCache || !this.cachedFilterProps;
        const filterProps = shouldCacheFilterProps ? this.getFilterProps() : this.cachedFilterProps;

        // A selection still running over the previous query would add its results to the new one.
        if (shouldCacheFilterProps) this.cancelSelection();

        const exactCount = withFullCount || toLastPage;
        let nextPageCount = this.pageCount;

        if (exactCount) {
          const countRes = await rpc.getFilteredTagCount({
            ...filterProps,
            curMaxPage: this.pageCount,
            forcePages: this.forcePages,
            page,
            pageSize: this.pageSize,
            withFull: true,
          });

          if (loadId !== this.loadId) return;

          if (!countRes.success) throw new Error(countRes.error);

          nextPageCount = countRes.data.pageCount;
        }

        const newPage = toLastPage
          ? Math.max(nextPageCount, 1)
          : exactCount
            ? Math.min(page ?? this.page, Math.max(nextPageCount, 1))
            : (page ?? this.page);

        const itemsRes = await rpc.listFilteredTag({
          ...filterProps,
          forcePages: this.forcePages,
          page: newPage,
          pageSize: this.pageSize,
        });

        if (loadId !== this.loadId) return;

        if (!itemsRes.success) throw new Error(itemsRes.error);

        let items = itemsRes.data;

        const results = await rpc.deriveTagCategories(items);

        if (loadId !== this.loadId) return;

        this.setResults(results.map((result) => new Stores.Tag(result)));

        if (shouldCacheFilterProps) this.setCachedFilterProps(derefMobx(filterProps));

        if (exactCount) {
          this.setPageCount(nextPageCount);
          this.setIsPageCountLoading(false);
        }

        this.setPage(newPage);
        this.setIsLoading(false);

        if (noCache) this.setHasChanges(false);

        if (!exactCount) {
          (async () => {
            try {
              const countRes = await rpc.getFilteredTagCount({
                ...filterProps,
                curMaxPage: this.pageCount,
                forcePages: this.forcePages,
                page: newPage,
                pageSize: this.pageSize,
                withFull: false,
              });

              if (loadId !== this.loadId) return;

              this.setIsPageCountLoading(false);

              if (!countRes.success) console.error(countRes.error);
              else this.setPageCount(countRes.data.pageCount);
            } catch (error) {
              if (loadId !== this.loadId) return;

              this.setIsPageCountLoading(false);
              console.error(error);
            }
          })();
        }

        return results;
      } catch (error) {
        if (loadId !== this.loadId) return;

        this.setIsLoading(false);
        this.setIsPageCountLoading(false);

        throw error;
      }
    },
  );

  @modelFlow
  loadSavedSearches = asyncAction(async () => {
    const res = await rpc.listSavedSearch({
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
    let res: Awaited<ReturnType<typeof rpc.createSavedSearch | typeof rpc.updateSavedSearch>>;

    if (selected)
      res = await rpc.updateSavedSearch({
        args: { id: selected.id, updates: { filterProps, label: trimmedLabel } },
      });
    else if (existing)
      res = await rpc.updateSavedSearch({
        args: { id: existing.id, updates: { filterProps } },
      });
    else
      res = await rpc.createSavedSearch({
        args: {
          dateCreated: dayjs().toISOString(),
          filterProps,
          label: trimmedLabel,
          searchType: "Tag",
        },
      });

    if (!res.success) throw new Error(res.error);

    await this.loadSavedSearches();
    this.setSelectedSavedSearchId(selected?.id ?? existing?.id ?? res.data.id);
    this.setIsSaveModalOpen(false);
    toast.success(selected || existing ? "Saved search updated" : "Saved search created");

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
      (!isDeepEqual(this.fileTags, []) ? 1 : 0) +
      (!isDeepEqual(this.hasRegEx, null) ? 1 : 0) +
      (!isDeepEqual(this.ids, []) ? 1 : 0) +
      (!isDeepEqual(this.label, "") ? 1 : 0) +
      (!isDeepEqual(this.numOfChildTags, { logOp: "", value: 0 }) ? 1 : 0) +
      (!isDeepEqual(this.numOfParentTags, { logOp: "", value: 0 }) ? 1 : 0) +
      (!isDeepEqual(this.rating, { logOp: "", value: 0 }) ? 1 : 0) +
      (!isDeepEqual(this.size, { logOp: "", value: 0 }) ? 1 : 0) +
      (!isDeepEqual(this.sortValue, getConfig().tags.manager.search.sort) ? 1 : 0) +
      (!isDeepEqual(this.tags, []) ? 1 : 0)
    );
  }

  @computed({ keepAlive: true })
  get resultsById() {
    return new Map(this.results.map((result) => [result.id, result]));
  }

  @computed({ keepAlive: true })
  get selectedIdSet() {
    return new Set(this.selectedIds);
  }

  /* DYNAMIC GETTERS */
  getCachedFilterProps() {
    if (!this.cachedFilterProps) this.setCachedFilterProps(derefMobx(this.getFilterProps()));

    return this.cachedFilterProps;
  }

  getFilterProps() {
    return {
      alias: this.alias,
      aliasMode: this.aliasMode,
      count: this.count,
      countMode: this.countMode,
      dateCreatedEnd: this.dateCreatedEnd,
      dateCreatedMode: this.dateCreatedMode,
      dateCreatedStart: this.dateCreatedStart,
      dateModifiedEnd: this.dateModifiedEnd,
      dateModifiedMode: this.dateModifiedMode,
      dateModifiedStart: this.dateModifiedStart,
      dateOfInceptionEnd: this.dateOfInceptionEnd,
      dateOfInceptionMode: this.dateOfInceptionMode,
      dateOfInceptionStart: this.dateOfInceptionStart,
      fileTagId: this.fileTags[0]?.id,
      hasRegEx: this.hasRegEx,
      ids: this.ids,
      label: this.label,
      labelMode: this.labelMode,
      numOfChildTags: this.numOfChildTags,
      numOfChildTagsMode: this.numOfChildTagsMode,
      numOfParentTags: this.numOfParentTags,
      numOfParentTagsMode: this.numOfParentTagsMode,
      rating: this.rating,
      ratingMode: this.ratingMode,
      size: this.size,
      sizeMode: this.sizeMode,
      sortValue: this.sortValue,
      ...getRootStore<Stores.RootStore>(this)?.tag?.tagSearchOptsToIds(this.tags),
    };
  }

  getIsSelected(id: string) {
    return this.selectedIdSet.has(id);
  }

  getResult(id: string) {
    return this.resultsById.get(id);
  }

  getSearchProps() {
    return derefMobx({
      alias: this.alias,
      aliasMode: this.aliasMode,
      count: this.count,
      countMode: this.countMode,
      dateCreatedEnd: this.dateCreatedEnd,
      dateCreatedMode: this.dateCreatedMode,
      dateCreatedStart: this.dateCreatedStart,
      dateModifiedEnd: this.dateModifiedEnd,
      dateModifiedMode: this.dateModifiedMode,
      dateModifiedStart: this.dateModifiedStart,
      dateOfInceptionEnd: this.dateOfInceptionEnd,
      dateOfInceptionMode: this.dateOfInceptionMode,
      dateOfInceptionStart: this.dateOfInceptionStart,
      fileTags: this.fileTags,
      hasRegEx: this.hasRegEx,
      ids: this.ids,
      label: this.label,
      labelMode: this.labelMode,
      numOfChildTags: this.numOfChildTags,
      numOfChildTagsMode: this.numOfChildTagsMode,
      numOfParentTags: this.numOfParentTags,
      numOfParentTagsMode: this.numOfParentTagsMode,
      rating: this.rating,
      ratingMode: this.ratingMode,
      size: this.size,
      sizeMode: this.sizeMode,
      sortValue: this.sortValue,
      tags: this.tags,
    });
  }
}

/* --------------------------------------------------------------------------- */
/*                               SCHEMA STORES
/* --------------------------------------------------------------------------- */

/* --------------------------------------------------------------------------- */
/*                               BackgroundOperation
/* --------------------------------------------------------------------------- */

@model("medior/_BackgroundOperation")
export class _BackgroundOperation extends Model({
  completedAt: prop<string>(null),
  dateCreated: prop<string>(() => dayjs().toISOString()),
  dateModified: prop<string>(),
  dismissedAt: prop<string>(null),
  error: prop<string>(null),
  failures: prop<Array<{ message: string; targetId: string }>>(() => []),
  id: prop<string>(),
  label: prop<string>(),
  message: prop<string>(null),
  processedCount: prop<number>(0),
  queueKey: prop<string>(null),
  source: prop<string>(null),
  startedAt: prop<string>(null),
  status: prop<"CANCELLED" | "COMPLETE" | "ERROR" | "PENDING" | "RUNNING">(),
  targetIds: prop<string[]>(() => []),
  targetVersions: prop<Record<string, string>>(null),
  totalCount: prop<number>(0),
  transformIds: prop<string[]>(() => []),
  transformOptions:
    prop<import("medior/server/database/actions/file-transforms").TransformQueueOptions>(null),
  type: prop<
    | "audioAnalysis"
    | "collectionMetadata"
    | "duplicateMerge"
    | "fileTagAncestors"
    | "importCleanup"
    | "importEntryMigration"
    | "mediaPathIndex"
    | "metadataAction"
    | "persistenceMigration"
    | "repair"
    | "tagHierarchy"
    | "tagMetadata"
    | "tagRefresh"
    | "transformQueue"
  >(),
  work: prop<import("medior/server/database/metadata-work").MetadataWork>(null),
}) {
  @modelAction
  update(updates: Partial<ModelCreationData<this>>) {
    applySnapshot(this, { ...getSnapshot(this), ...updates });
  }
}

@model("medior/_BackgroundOperationStore")
export class _BackgroundOperationStore extends Model({
  isLoading: prop<boolean>(false).withSetter(),
}) {
  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  createBackgroundOperation = asyncAction(async (args: Types.CreateBackgroundOperationInput) => {
    this.setIsLoading(true);

    try {
      const res = await rpc.createBackgroundOperation({ args });
      if (!res.success) throw new Error(res.error);
      return res.data;
    } finally {
      this.setIsLoading(false);
    }
  });

  @modelFlow
  deleteBackgroundOperation = asyncAction(async (args: Types.DeleteBackgroundOperationInput) => {
    this.setIsLoading(true);

    try {
      const res = await rpc.deleteBackgroundOperation({ args });
      if (!res.success) throw new Error(res.error);
      return res.data;
    } finally {
      this.setIsLoading(false);
    }
  });

  @modelFlow
  updateBackgroundOperation = asyncAction(async (args: Types.UpdateBackgroundOperationInput) => {
    this.setIsLoading(true);

    try {
      const res = await rpc.updateBackgroundOperation({ args });
      if (!res.success) throw new Error(res.error);
      return res.data;
    } finally {
      this.setIsLoading(false);
    }
  });
}
/* --------------------------------------------------------------------------- */
/*                               DeletedFile
/* --------------------------------------------------------------------------- */

@model("medior/_DeletedFile")
export class _DeletedFile extends Model({
  dateCreated: prop<string>(),
  hash: prop<string>(),
  id: prop<string>(),
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

    try {
      const res = await rpc.createDeletedFile({ args });
      if (!res.success) throw new Error(res.error);
      return res.data;
    } finally {
      this.setIsLoading(false);
    }
  });

  @modelFlow
  deleteDeletedFile = asyncAction(async (args: Types.DeleteDeletedFileInput) => {
    this.setIsLoading(true);

    try {
      const res = await rpc.deleteDeletedFile({ args });
      if (!res.success) throw new Error(res.error);
      return res.data;
    } finally {
      this.setIsLoading(false);
    }
  });

  @modelFlow
  updateDeletedFile = asyncAction(async (args: Types.UpdateDeletedFileInput) => {
    this.setIsLoading(true);

    try {
      const res = await rpc.updateDeletedFile({ args });
      if (!res.success) throw new Error(res.error);
      return res.data;
    } finally {
      this.setIsLoading(false);
    }
  });
}
/* --------------------------------------------------------------------------- */
/*                               File
/* --------------------------------------------------------------------------- */

@model("medior/_File")
export class _File extends Model({
  audioBitrate: prop<number>(null),
  audioCodec: prop<string>(null),
  bitrate: prop<number>(null),
  collectionIds: prop<string[]>(() => []),
  dateCreated: prop<string>(() => dayjs().toISOString()),
  dateImported: prop<string>(),
  dateModified: prop<string>(),
  diffusionParams: prop<string>(null),
  duration: prop<number>(null),
  ext: prop<string>(),
  frameRate: prop<number>(null),
  hash: prop<string>(),
  hasTranscript: prop<boolean>(),
  height: prop<number>(),
  id: prop<string>(),
  isArchived: prop<boolean>(null),
  isAudioCorrupted: prop<boolean>(null),
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
  peakDecibels: prop<number>(null),
  previousHashes: prop<string[]>(null),
  rating: prop<number>(),
  size: prop<number>(),
  sourceHash: prop<string>(null),
  subtitles: prop<Array<{ ext: string; path: string; pathKey: string }>>(null),
  tagIds: prop<string[]>(),
  tagIdsWithAncestors: prop<string[]>(),
  thumb: prop<{
    frameHeight?: number;
    frameWidth?: number;
    ntfsFileId?: string;
    ntfsVolumeId?: string;
    path: string;
  }>(),
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
  transcription: prop<{
    segments: Array<{ end: number; start: number; text: string }>;
    text: string;
  }>(null),
  videoCodec: prop<string>(null),
  waveformPeaks: prop<number[]>(null),
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

    try {
      const res = await rpc.createFile({ args });
      if (!res.success) throw new Error(res.error);
      return res.data;
    } finally {
      this.setIsLoading(false);
    }
  });

  @modelFlow
  deleteFile = asyncAction(async (args: Types.DeleteFileInput) => {
    this.setIsLoading(true);

    try {
      const res = await rpc.deleteFile({ args });
      if (!res.success) throw new Error(res.error);
      return res.data;
    } finally {
      this.setIsLoading(false);
    }
  });

  @modelFlow
  updateFile = asyncAction(async (args: Types.UpdateFileInput) => {
    this.setIsLoading(true);

    try {
      const res = await rpc.updateFile({ args });
      if (!res.success) throw new Error(res.error);
      return res.data;
    } finally {
      this.setIsLoading(false);
    }
  });
}
/* --------------------------------------------------------------------------- */
/*                               FileCollection
/* --------------------------------------------------------------------------- */

@model("medior/_FileCollection")
export class _FileCollection extends Model({
  dateCreated: prop<string>(() => dayjs().toISOString()),
  dateModified: prop<string>(null),
  fileCount: prop<number>(0),
  fileIdIndexes: prop<Array<{ fileId: string; index: number }>>(),
  id: prop<string>(),
  rating: prop<number>(0),
  ratingIsManual: prop<boolean>(null),
  size: prop<number>(),
  sourceFolderKeys: prop<string[]>(() => []),
  sourceFolderPaths: prop<string[]>(() => []),
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

    try {
      const res = await rpc.createFileCollection({ args });
      if (!res.success) throw new Error(res.error);
      return res.data;
    } finally {
      this.setIsLoading(false);
    }
  });

  @modelFlow
  deleteFileCollection = asyncAction(async (args: Types.DeleteFileCollectionInput) => {
    this.setIsLoading(true);

    try {
      const res = await rpc.deleteFileCollection({ args });
      if (!res.success) throw new Error(res.error);
      return res.data;
    } finally {
      this.setIsLoading(false);
    }
  });

  @modelFlow
  updateFileCollection = asyncAction(async (args: Types.UpdateFileCollectionInput) => {
    this.setIsLoading(true);

    try {
      const res = await rpc.updateFileCollection({ args });
      if (!res.success) throw new Error(res.error);
      return res.data;
    } finally {
      this.setIsLoading(false);
    }
  });
}
/* --------------------------------------------------------------------------- */
/*                               FileImport
/* --------------------------------------------------------------------------- */

@model("medior/_FileImport")
export class _FileImport extends Model({
  batchId: prop<string>(null),
  dateCreated: prop<string>(),
  diffusionParams: prop<string>(null),
  errorMsg: prop<string>(null),
  extension: prop<string>(),
  fileId: prop<string>(null),
  hash: prop<string>(null),
  id: prop<string>(null),
  index: prop<number>(null),
  name: prop<string>(),
  path: prop<string>(),
  progressRevision: prop<number>(0),
  size: prop<number>(),
  status: prop<string | "COMPLETE" | "DELETED" | "DUPLICATE" | "ERROR" | "PENDING">("PENDING"),
  subtitles: prop<Array<{ path: string }>>(null),
  tagIds: prop<string[]>(() => []),
  thumb: prop<{
    frameHeight?: number;
    frameWidth?: number;
    ntfsFileId?: string;
    ntfsVolumeId?: string;
    path: string;
  }>(null),
}) {
  @modelAction
  update(updates: Partial<ModelCreationData<this>>) {
    applySnapshot(this, { ...getSnapshot(this), ...updates });
  }
}

/* --------------------------------------------------------------------------- */
/*                               FileImportBatch
/* --------------------------------------------------------------------------- */

@model("medior/_FileImportBatch")
export class _FileImportBatch extends Model({
  collectionId: prop<string>(null),
  collectionSourceFolderPath: prop<string>(null),
  collectionTitle: prop<string>(null),
  completedAt: prop<string>(),
  dateCreated: prop<string>(() => dayjs().toISOString()),
  deleteOnImport: prop<boolean>(),
  fileCount: prop<number>(0),
  id: prop<string>(),
  ignorePrevDeleted: prop<boolean>(),
  isCompleted: prop<boolean>(false),
  isReady: prop<boolean>(false),
  lastUploadHash: prop<string>(null),
  lastUploadOffset: prop<number>(null),
  mediaProgram: prop<import("medior/utils/common/media-programs").MediaProgramImport>(null),
  processedCount: prop<number>(0),
  processedSize: prop<number>(0),
  progressRevision: prop<number>(0),
  rootFolderPath: prop<string>(),
  size: prop<number>(null),
  sourceFolderPath: prop<string>(null),
  startedAt: prop<string>(null),
  subtitleMode: prop<"embed" | "keep" | "none">(null),
  tagIds: prop<string[]>(() => []),
  tagIdsWithAncestors: prop<string[]>(() => []),
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

    try {
      const res = await rpc.createFileImportBatch({ args });
      if (!res.success) throw new Error(res.error);
      return res.data;
    } finally {
      this.setIsLoading(false);
    }
  });

  @modelFlow
  deleteFileImportBatch = asyncAction(async (args: Types.DeleteFileImportBatchInput) => {
    this.setIsLoading(true);

    try {
      const res = await rpc.deleteFileImportBatch({ args });
      if (!res.success) throw new Error(res.error);
      return res.data;
    } finally {
      this.setIsLoading(false);
    }
  });

  @modelFlow
  updateFileImportBatch = asyncAction(async (args: Types.UpdateFileImportBatchInput) => {
    this.setIsLoading(true);

    try {
      const res = await rpc.updateFileImportBatch({ args });
      if (!res.success) throw new Error(res.error);
      return res.data;
    } finally {
      this.setIsLoading(false);
    }
  });
}
/* --------------------------------------------------------------------------- */
/*                               FileTransform
/* --------------------------------------------------------------------------- */

@model("medior/_FileTransform")
export class _FileTransform extends Model({
  afterAudioBitrate: prop<number>(null),
  afterAudioCodec: prop<string>(null),
  afterBitrate: prop<number>(null),
  afterDuration: prop<number>(null),
  afterExt: prop<string>(null),
  afterFrameRate: prop<number>(null),
  afterHash: prop<string>(null),
  afterHeight: prop<number>(null),
  afterPath: prop<string>(null),
  afterSize: prop<number>(null),
  afterVideoCodec: prop<string>(null),
  afterWidth: prop<number>(null),
  beforeAudioBitrate: prop<number>(null),
  beforeAudioCodec: prop<string>(null),
  beforeBitrate: prop<number>(null),
  beforeDuration: prop<number>(null),
  beforeExt: prop<string>(),
  beforeFrameRate: prop<number>(null),
  beforeHash: prop<string>(null),
  beforeHeight: prop<number>(null),
  beforePath: prop<string>(),
  beforeSize: prop<number>(),
  beforeVideoCodec: prop<string>(null),
  beforeWidth: prop<number>(null),
  cleanupPending: prop<boolean>(false),
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
  dateCreated: prop<string>(() => dayjs().toISOString()),
  duplicateFileId: prop<string>(null),
  duplicatePath: prop<string>(null),
  errorMsg: prop<string>(null),
  fileId: prop<string>(),
  finalizationPending: prop<boolean>(false),
  id: prop<string>(),
  isCompleted: prop<boolean>(false),
  outputTempPath: prop<string>(null),
  progressPercent: prop<number>(null),
  progressSize: prop<number>(null),
  progressStage: prop<string>(null),
  progressTime: prop<string>(null),
  queueIndex: prop<number>(null),
  regenerationPending: prop<boolean>(false),
  regenerationTagIds: prop<string[]>(() => []),
  spliceMode: prop<"copy" | "replace">(null),
  startedAt: prop<string>(null),
  status: prop<
    | string
    | "COMPLETE"
    | "COMPRESSED"
    | "DUPLICATE"
    | "ERROR"
    | "MERGED"
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

    try {
      const res = await rpc.createFileTransform({ args });
      if (!res.success) throw new Error(res.error);
      return res.data;
    } finally {
      this.setIsLoading(false);
    }
  });

  @modelFlow
  deleteFileTransform = asyncAction(async (args: Types.DeleteFileTransformInput) => {
    this.setIsLoading(true);

    try {
      const res = await rpc.deleteFileTransform({ args });
      if (!res.success) throw new Error(res.error);
      return res.data;
    } finally {
      this.setIsLoading(false);
    }
  });

  @modelFlow
  updateFileTransform = asyncAction(async (args: Types.UpdateFileTransformInput) => {
    this.setIsLoading(true);

    try {
      const res = await rpc.updateFileTransform({ args });
      if (!res.success) throw new Error(res.error);
      return res.data;
    } finally {
      this.setIsLoading(false);
    }
  });
}
/* --------------------------------------------------------------------------- */
/*                               MediaProgram
/* --------------------------------------------------------------------------- */

@model("medior/_MediaProgram")
export class _MediaProgram extends Model({
  collectionIdIndexes: prop<Array<{ collectionId: string; index: number }>>(() => []),
  dateCreated: prop<string>(() => dayjs().toISOString()),
  dateLastWatched: prop<string>(null),
  dateModified: prop<string>(null),
  fileCount: prop<number>(0),
  genreIds: prop<string[]>(() => []),
  id: prop<string>(),
  isRewatching: prop<boolean>(false),
  language: prop<string>(null),
  lastWatchedFileId: prop<string>(null),
  medium: prop<string>(null),
  name: prop<string>(),
  posterFileId: prop<string>(null),
  rating: prop<number>(0),
  ratingIsManual: prop<boolean>(null),
  rewatchCount: prop<number>(0),
  rewatchedFileIds: prop<string[]>(() => []),
  size: prop<number>(0),
  sourceFolderKey: prop<string>(null),
  sourceFolderPath: prop<string>(null),
  tagIds: prop<string[]>(() => []),
  tagIdsWithAncestors: prop<string[]>(() => []),
  type: prop<string>(null),
  watchedFileIds: prop<string[]>(() => []),
  watchStatus: prop<"dropped" | "inactive" | "unwatched" | "watched" | "watching">(
    "unwatched" as const,
  ),
  year: prop<number>(null),
}) {
  @modelAction
  update(updates: Partial<ModelCreationData<this>>) {
    applySnapshot(this, { ...getSnapshot(this), ...updates });
  }
}

@model("medior/_MediaProgramStore")
export class _MediaProgramStore extends Model({ isLoading: prop<boolean>(false).withSetter() }) {
  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  createMediaProgram = asyncAction(async (args: Types._CreateMediaProgramInput) => {
    this.setIsLoading(true);

    try {
      const res = await rpc._createMediaProgram({ args });
      if (!res.success) throw new Error(res.error);
      return res.data;
    } finally {
      this.setIsLoading(false);
    }
  });

  @modelFlow
  deleteMediaProgram = asyncAction(async (args: Types.DeleteMediaProgramInput) => {
    this.setIsLoading(true);

    try {
      const res = await rpc.deleteMediaProgram({ args });
      if (!res.success) throw new Error(res.error);
      return res.data;
    } finally {
      this.setIsLoading(false);
    }
  });

  @modelFlow
  updateMediaProgram = asyncAction(async (args: Types._UpdateMediaProgramInput) => {
    this.setIsLoading(true);

    try {
      const res = await rpc._updateMediaProgram({ args });
      if (!res.success) throw new Error(res.error);
      return res.data;
    } finally {
      this.setIsLoading(false);
    }
  });
}
/* --------------------------------------------------------------------------- */
/*                               Notification
/* --------------------------------------------------------------------------- */

@model("medior/_Notification")
export class _Notification extends Model({
  dateCreated: prop<string>(() => dayjs().toISOString()),
  id: prop<string>(),
  isRead: prop<boolean>(false),
  message: prop<string>(),
  type: prop<"error" | "info" | "success" | "warning">(),
}) {
  @modelAction
  update(updates: Partial<ModelCreationData<this>>) {
    applySnapshot(this, { ...getSnapshot(this), ...updates });
  }
}

@model("medior/_NotificationStore")
export class _NotificationStore extends Model({ isLoading: prop<boolean>(false).withSetter() }) {
  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  createNotification = asyncAction(async (args: Types.CreateNotificationInput) => {
    this.setIsLoading(true);

    try {
      const res = await rpc.createNotification({ args });
      if (!res.success) throw new Error(res.error);
      return res.data;
    } finally {
      this.setIsLoading(false);
    }
  });

  @modelFlow
  deleteNotification = asyncAction(async (args: Types.DeleteNotificationInput) => {
    this.setIsLoading(true);

    try {
      const res = await rpc.deleteNotification({ args });
      if (!res.success) throw new Error(res.error);
      return res.data;
    } finally {
      this.setIsLoading(false);
    }
  });

  @modelFlow
  updateNotification = asyncAction(async (args: Types.UpdateNotificationInput) => {
    this.setIsLoading(true);

    try {
      const res = await rpc.updateNotification({ args });
      if (!res.success) throw new Error(res.error);
      return res.data;
    } finally {
      this.setIsLoading(false);
    }
  });
}
/* --------------------------------------------------------------------------- */
/*                               SavedImportConfig
/* --------------------------------------------------------------------------- */

@model("medior/_SavedImportConfig")
export class _SavedImportConfig extends Model({
  dateCreated: prop<string>(() => dayjs().toISOString()),
  dateModified: prop<string>(null),
  folderPath: prop<string>(),
  id: prop<string>(),
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

    try {
      const res = await rpc.createSavedImportConfig({ args });
      if (!res.success) throw new Error(res.error);
      return res.data;
    } finally {
      this.setIsLoading(false);
    }
  });

  @modelFlow
  deleteSavedImportConfig = asyncAction(async (args: Types.DeleteSavedImportConfigInput) => {
    this.setIsLoading(true);

    try {
      const res = await rpc.deleteSavedImportConfig({ args });
      if (!res.success) throw new Error(res.error);
      return res.data;
    } finally {
      this.setIsLoading(false);
    }
  });

  @modelFlow
  updateSavedImportConfig = asyncAction(async (args: Types.UpdateSavedImportConfigInput) => {
    this.setIsLoading(true);

    try {
      const res = await rpc.updateSavedImportConfig({ args });
      if (!res.success) throw new Error(res.error);
      return res.data;
    } finally {
      this.setIsLoading(false);
    }
  });
}
/* --------------------------------------------------------------------------- */
/*                               SavedSearch
/* --------------------------------------------------------------------------- */

@model("medior/_SavedSearch")
export class _SavedSearch extends Model({
  dateCreated: prop<string>(() => dayjs().toISOString()),
  filterProps: prop<Record<string, any>>(),
  id: prop<string>(),
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

    try {
      const res = await rpc.createSavedSearch({ args });
      if (!res.success) throw new Error(res.error);
      return res.data;
    } finally {
      this.setIsLoading(false);
    }
  });

  @modelFlow
  deleteSavedSearch = asyncAction(async (args: Types.DeleteSavedSearchInput) => {
    this.setIsLoading(true);

    try {
      const res = await rpc.deleteSavedSearch({ args });
      if (!res.success) throw new Error(res.error);
      return res.data;
    } finally {
      this.setIsLoading(false);
    }
  });

  @modelFlow
  updateSavedSearch = asyncAction(async (args: Types.UpdateSavedSearchInput) => {
    this.setIsLoading(true);

    try {
      const res = await rpc.updateSavedSearch({ args });
      if (!res.success) throw new Error(res.error);
      return res.data;
    } finally {
      this.setIsLoading(false);
    }
  });
}
/* --------------------------------------------------------------------------- */
/*                               Tag
/* --------------------------------------------------------------------------- */

@model("medior/_Tag")
export class _Tag extends Model({
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
  dateCreated: prop<string>(() => dayjs().toISOString()),
  dateModified: prop<string>(),
  dateOfInception: prop<string>(null),
  descendantIds: prop<string[]>(() => []),
  id: prop<string>(),
  label: prop<string>(),
  lastSearchedAt: prop<string>(null),
  parentIds: prop<string[]>(() => []),
  rating: prop<number>(0),
  ratingIsManual: prop<boolean>(null),
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

    try {
      const res = await rpc._createTag({ args });
      if (!res.success) throw new Error(res.error);
      return res.data;
    } finally {
      this.setIsLoading(false);
    }
  });

  @modelFlow
  deleteTag = asyncAction(async (args: Types._DeleteTagInput) => {
    this.setIsLoading(true);

    try {
      const res = await rpc._deleteTag({ args });
      if (!res.success) throw new Error(res.error);
      return res.data;
    } finally {
      this.setIsLoading(false);
    }
  });

  @modelFlow
  updateTag = asyncAction(async (args: Types.UpdateTagInput) => {
    this.setIsLoading(true);

    try {
      const res = await rpc.updateTag({ args });
      if (!res.success) throw new Error(res.error);
      return res.data;
    } finally {
      this.setIsLoading(false);
    }
  });
}
