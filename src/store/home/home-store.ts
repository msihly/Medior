import { SortMenuProps } from "components";
import { Model, getRootStore, model, modelAction, modelFlow, prop } from "mobx-keystone";
import { RootStore, TagOption, asyncAction } from "store";
import { dayjs, getConfig, ImageType, LogicalOp, makePerfLog, trpc, VideoType } from "utils";

const NUMERICAL_ATTRIBUTES = ["count", "duration", "height", "rating", "size", "width"];

export type SelectedImageTypes = { [ext in ImageType]: boolean };
export type SelectedVideoTypes = { [ext in VideoType]: boolean };

export const sortFiles = <File>({
  a,
  b,
  isDesc,
  key,
}: {
  a: File;
  b: File;
  isDesc: boolean;
  key: string;
}) => {
  const first = a[key];
  const second = b[key];

  let comparison: number = null;
  if (!first) comparison = 1;
  else if (!second) comparison = -1;
  else if (NUMERICAL_ATTRIBUTES.includes(key)) comparison = second - first;
  else if (["dateCreated", "dateModified"].includes(key))
    comparison = dayjs(second).isBefore(first) ? -1 : 1;
  else comparison = String(second).localeCompare(String(first));

  return isDesc ? comparison : comparison * -1;
};

@model("medior/HomeStore")
export class HomeStore extends Model({
  dateCreatedEnd: prop<string>("").withSetter(),
  dateCreatedStart: prop<string>("").withSetter(),
  dateModifiedEnd: prop<string>("").withSetter(),
  dateModifiedStart: prop<string>("").withSetter(),
  fileCardFit: prop<"contain" | "cover">(() => getConfig().file.fileCardFit).withSetter(),
  hasDiffParams: prop<boolean>(false).withSetter(),
  hasQueuedReload: prop<boolean>(false).withSetter(),
  isArchiveOpen: prop<boolean>(false).withSetter(),
  isDraggingIn: prop<boolean>(false).withSetter(),
  isDraggingOut: prop<boolean>(false).withSetter(),
  isDrawerOpen: prop<boolean>(true).withSetter(),
  isLoading: prop<boolean>(false).withSetter(),
  isSettingsOpen: prop<boolean>(false).withSetter(),
  isSettingsLoading: prop<boolean>(false).withSetter(),
  numOfTagsOp: prop<LogicalOp | "">("").withSetter(),
  numOfTagsValue: prop<number>(0).withSetter(),
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
  settingsHasUnsavedChanges: prop<boolean>(false).withSetter(),
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
  resetSearch() {
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
        (stores.file.page - 1) * getConfig().file.searchFileCount +
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
      page: stores.file.page,
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
      page: page ?? stores.file.page,
      pageSize: getConfig().file.searchFileCount,
    });
    if (!filteredRes.success) throw new Error(filteredRes.error);

    const { files, pageCount } = filteredRes.data;
    if (debug) perfLog(`Loaded ${files.length} filtered files`);

    stores.file.overwrite(files.map((f) => ({ ...f, hasFaceModels: f.faceModels?.length > 0 })));
    if (debug) perfLog("FileStore.files overwrite and re-render");

    stores.file.setPageCount(pageCount);
    if (page) stores.file.setPage(page);
    if (debug) perfLog(`Set page to ${page ?? stores.file.page} and pageCount to ${pageCount}`);

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
