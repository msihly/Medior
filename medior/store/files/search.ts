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
  numOfTagsOp: prop<LogicalOp | "">("").withSetter(),
  numOfTagsValue: prop<number>(0).withSetter(),
  page: prop<number>(1).withSetter(),
  pageCount: prop<number>(1).withSetter(),
  searchValue: prop<TagOption[]>(() => []).withSetter(),
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
}) {
  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  reloadIfQueued() {
    const stores = getRootStore<RootStore>(this);
    if (this.hasQueuedReload && !stores._getIsBlockingModalOpen()) {
      this.setHasQueuedReload(false);
      this.loadFilteredFiles();
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
    this.numOfTagsOp = "";
    this.numOfTagsValue = 0;
    this.searchValue = [];
    this.selectedImageTypes = Object.fromEntries(
      config.file.imageTypes.map((ext) => [ext, true])
    ) as SelectedImageTypes;
    this.selectedVideoTypes = Object.fromEntries(
      config.file.videoTypes.map((ext) => [ext, true])
    ) as SelectedVideoTypes;
    this.sortValue = config.file.searchSort;
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
        ...stores.tag.tagSearchOptsToIds(this.searchValue),
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
    const stores = getRootStore<RootStore>(this);

    const res = await trpc.listFileIdsForCarousel.mutate({
      ...this.getFilterProps(),
      ...stores.tag.tagSearchOptsToIds(this.searchValue),
      page: this.page,
      pageSize: getConfig().file.searchFileCount,
    });
    if (!res.success) throw new Error(res.error);
    if (!res.data?.length) throw new Error("No files found");
    return res.data;
  });

  @modelFlow
  loadFilteredFiles = asyncAction(async ({ page }: { page?: number } = {}) => {
    const debug = false;
    const { perfLog, perfLogTotal } = makePerfLog("[LFF]");

    const stores = getRootStore<RootStore>(this);
    if (!stores) throw new Error("RootStore not found");

    this.setIsLoading(true);

    const filteredRes = await trpc.listFilteredFiles.mutate({
      ...this.getFilterProps(),
      ...stores.tag.tagSearchOptsToIds(this.searchValue),
      page: page ?? this.page,
      pageSize: getConfig().file.searchFileCount,
    });
    if (!filteredRes.success) throw new Error(filteredRes.error);

    const { files, pageCount } = filteredRes.data;
    if (debug) perfLog(`Loaded ${files.length} filtered files`);

    stores.file.overwrite(files.map((f) => ({ ...f, hasFaceModels: f.faceModels?.length > 0 })));
    if (debug) perfLog("FileStore.files overwrite and re-render");

    this.setPageCount(pageCount);
    if (page) this.setPage(page);
    if (debug) perfLog(`Set page to ${page ?? this.page} and pageCount to ${pageCount}`);

    if (debug) perfLogTotal(`Loaded ${files.length} files`);
    this.setIsLoading(false);

    return files;
  });

  /* --------------------------------- DYNAMIC GETTERS -------------------------------- */
  getFilterProps() {
    return {
      dateCreatedEnd: this.dateCreatedEnd,
      dateCreatedStart: this.dateCreatedStart,
      dateModifiedEnd: this.dateModifiedEnd,
      dateModifiedStart: this.dateModifiedStart,
      hasDiffParams: this.hasDiffParams,
      isArchived: this.isArchiveOpen,
      isSortDesc: this.sortValue.isDesc,
      numOfTagsOp: this.numOfTagsOp,
      numOfTagsValue: this.numOfTagsValue,
      searchValue: this.searchValue,
      selectedImageTypes: this.selectedImageTypes,
      selectedVideoTypes: this.selectedVideoTypes,
      sortKey: this.sortValue.key,
    };
  }
}
