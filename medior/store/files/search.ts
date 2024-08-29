import * as Types from "medior/database/types";
import { computed } from "mobx";
import { getRootStore, Model, model, modelAction, modelFlow, prop } from "mobx-keystone";
import { asyncAction, RootStore, TagOption } from "medior/store";
import { SortMenuProps } from "medior/components";
import { getConfig, ImageType, LogicalOp, makePerfLog, trpc, VideoType } from "medior/utils";

export type SelectedImageTypes = { [ext in ImageType]: boolean };
export type SelectedVideoTypes = { [ext in VideoType]: boolean };

@model("medior/FileSearch")
export class FileSearch extends Model({
  dateCreatedEnd: prop<string>("").withSetter(),
  dateCreatedStart: prop<string>("").withSetter(),
  dateModifiedEnd: prop<string>("").withSetter(),
  dateModifiedStart: prop<string>("").withSetter(),
  hasDiffParams: prop<boolean>(false).withSetter(),
  hasQueuedReload: prop<boolean>(false).withSetter(),
  isArchiveOpen: prop<boolean>(false).withSetter(),
  isLoading: prop<boolean>(false).withSetter(),
  maxHeight: prop<number>(null).withSetter(),
  maxWidth: prop<number>(null).withSetter(),
  minHeight: prop<number>(null).withSetter(),
  minWidth: prop<number>(null).withSetter(),
  numOfTagsOp: prop<LogicalOp | "">("").withSetter(),
  numOfTagsValue: prop<number>(0).withSetter(),
  page: prop<number>(1).withSetter(),
  pageCount: prop<number>(1).withSetter(),
  ratingOp: prop<LogicalOp | "">("").withSetter(),
  ratingValue: prop<number>(0).withSetter(),
  selectedImageTypes: prop<SelectedImageTypes>(
    () =>
      Object.fromEntries(
        getConfig().file.imageTypes.map((ext) => [ext, true])
      ) as SelectedImageTypes
  ),
  selectedVideoTypes: prop<SelectedVideoTypes>(
    () =>
      Object.fromEntries(
        getConfig().file.videoTypes.map((ext) => [ext, true])
      ) as SelectedVideoTypes
  ),
  sortValue: prop<SortMenuProps["value"]>(() => getConfig().file.searchSort).withSetter(),
  tags: prop<TagOption[]>(() => []).withSetter(),
}) {
  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  reloadIfQueued() {
    const stores = getRootStore<RootStore>(this);
    if (this.hasQueuedReload && !stores._getIsBlockingModalOpen()) {
      this.setHasQueuedReload(false);
      this.loadFiltered();
    }
  }

  @modelAction
  reset() {
    const config = getConfig();

    this.dateCreatedEnd = "";
    this.dateCreatedStart = "";
    this.dateModifiedEnd = "";
    this.dateModifiedStart = "";
    this.hasDiffParams = false;
    this.isArchiveOpen = false;
    this.maxHeight = null;
    this.maxWidth = null;
    this.minHeight = null;
    this.minWidth = null;
    this.numOfTagsOp = "";
    this.numOfTagsValue = 0;
    this.page = 1;
    this.ratingOp = "";
    this.ratingValue = 0;
    this.selectedImageTypes = Object.fromEntries(
      config.file.imageTypes.map((ext) => [ext, true])
    ) as SelectedImageTypes;
    this.selectedVideoTypes = Object.fromEntries(
      config.file.videoTypes.map((ext) => [ext, true])
    ) as SelectedVideoTypes;
    this.sortValue = config.file.searchSort;
    this.tags = [];
  }

  @modelAction
  setSelectedImageTypes(types: Partial<SelectedImageTypes>) {
    this.selectedImageTypes = { ...this.selectedImageTypes, ...types };
  }

  @modelAction
  setSelectedVideoTypes(types: Partial<SelectedVideoTypes>) {
    this.selectedVideoTypes = { ...this.selectedVideoTypes, ...types };
  }

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  getShiftSelectedFiles = asyncAction(
    async ({ id, selectedIds }: { id: string; selectedIds: string[] }) => {
      const stores = getRootStore<RootStore>(this);

      const clickedIndex =
        (this.page - 1) * getConfig().file.searchFileCount +
        stores.file.files.findIndex((f) => f.id === id);

      const res = await trpc.getShiftSelectedFiles.mutate({
        ...this.getFilterProps(),
        clickedId: id,
        clickedIndex,
        selectedIds,
      });
      if (!res.success) throw new Error(res.error);
      return res.data;
    }
  );

  @modelFlow
  listIdsForCarousel = asyncAction(async () => {
    const res = await trpc.listFileIdsForCarousel.mutate({
      ...this.getFilterProps(),
      page: this.page,
      pageSize: getConfig().file.searchFileCount,
    });
    if (!res.success) throw new Error(res.error);
    if (!res.data?.length) throw new Error("No files found");
    return res.data;
  });

  @modelFlow
  loadFiltered = asyncAction(
    async (
      args: {
        filterProps?: Partial<Types.ListFilteredFilesInput>;
        noOverwrite?: boolean;
        page?: number;
        pageSize?: number;
      } = {}
    ) => {
      const debug = false;
      const { perfLog, perfLogTotal } = makePerfLog("[LFF]");

      const stores = getRootStore<RootStore>(this);

      this.setIsLoading(true);

      const filteredRes = await trpc.listFilteredFiles.mutate({
        ...this.getFilterProps(),
        ...args.filterProps,
        page: args.page ?? this.page,
        pageSize: args.pageSize ?? getConfig().file.searchFileCount,
      });
      if (!filteredRes.success) throw new Error(filteredRes.error);

      const { files, pageCount } = filteredRes.data;
      if (debug) perfLog(`Loaded ${files.length} filtered files`);

      if (!args.noOverwrite) {
        stores.file.overwrite([...files]);
        if (debug) perfLog("Overwrite and re-render");
      }

      this.setPageCount(pageCount);
      if (args.page) this.setPage(args.page);
      if (debug) perfLog(`Set page to ${args.page ?? this.page} and pageCount to ${pageCount}`);

      if (debug) perfLogTotal(`Loaded ${files.length} files`);
      this.setIsLoading(false);

      return files;
    }
  );

  /* --------------------------------- GETTERS -------------------------------- */
  @computed
  get numOfFilters() {
    return (
      (this.dateCreatedEnd ? 1 : 0) +
      (this.dateCreatedStart ? 1 : 0) +
      (this.dateModifiedEnd ? 1 : 0) +
      (this.dateModifiedStart ? 1 : 0) +
      (this.hasDiffParams ? 1 : 0) +
      (this.isArchiveOpen ? 1 : 0) +
      (this.maxHeight !== null ? 1 : 0) +
      (this.maxWidth !== null ? 1 : 0) +
      (this.minHeight !== null ? 1 : 0) +
      (this.minWidth !== null ? 1 : 0) +
      (this.numOfTagsOp ? 1 : 0) +
      (this.ratingOp ? 1 : 0) +
      (this.tags.length ? 1 : 0) +
      (Object.values(this.selectedImageTypes).some((v) => !v) ? 1 : 0) +
      (Object.values(this.selectedVideoTypes).some((v) => !v) ? 1 : 0)
    );
  }

  /* --------------------------------- DYNAMIC GETTERS -------------------------------- */
  getFilterProps() {
    const stores = getRootStore<RootStore>(this);

    return {
      ...stores.tag.tagSearchOptsToIds(this.tags),
      dateCreatedEnd: this.dateCreatedEnd,
      dateCreatedStart: this.dateCreatedStart,
      dateModifiedEnd: this.dateModifiedEnd,
      dateModifiedStart: this.dateModifiedStart,
      hasDiffParams: this.hasDiffParams,
      isArchived: this.isArchiveOpen,
      isSortDesc: this.sortValue.isDesc,
      maxHeight: this.maxHeight,
      maxWidth: this.maxWidth,
      minHeight: this.minHeight,
      minWidth: this.minWidth,
      numOfTagsOp: this.numOfTagsOp,
      numOfTagsValue: this.numOfTagsValue,
      ratingOp: this.ratingOp,
      ratingValue: this.ratingValue,
      selectedImageTypes: this.selectedImageTypes,
      selectedVideoTypes: this.selectedVideoTypes,
      sortKey: this.sortValue.key,
    };
  }
}
