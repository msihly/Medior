import {
  Model,
  _async,
  _await,
  getRootStore,
  model,
  modelAction,
  modelFlow,
  prop,
} from "mobx-keystone";
import { RootStore, TagOption } from "store";
import {
  CONSTANTS,
  IMAGE_TYPES,
  ImageType,
  VIDEO_TYPES,
  VideoType,
  dayjs,
  handleErrors,
  makePerfLog,
  trpc,
} from "utils";

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

@model("mediaViewer/HomeStore")
export class HomeStore extends Model({
  fileCardFit: prop<"contain" | "cover">("contain").withSetter(),
  includeTagged: prop<boolean>(false).withSetter(),
  includeUntagged: prop<boolean>(false).withSetter(),
  isArchiveOpen: prop<boolean>(false).withSetter(),
  isDraggingIn: prop<boolean>(false).withSetter(),
  isDraggingOut: prop<boolean>(false).withSetter(),
  isDrawerOpen: prop<boolean>(true).withSetter(),
  searchValue: prop<TagOption[]>(() => []).withSetter(),
  selectedImageTypes: prop<SelectedImageTypes>(
    () => Object.fromEntries(IMAGE_TYPES.map((ext) => [ext, true])) as SelectedImageTypes
  ),
  selectedVideoTypes: prop<SelectedVideoTypes>(
    () => Object.fromEntries(VIDEO_TYPES.map((ext) => [ext, true])) as SelectedVideoTypes
  ),
  sortValue: prop<{ isDesc: boolean; key: string }>(() => ({
    isDesc: true,
    key: "dateCreated",
  })).withSetter(),
}) {
  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  removeDeletedTag(id: string) {
    this.searchValue.splice(this.searchValue.findIndex((t) => t.id === id));
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
  getShiftSelectedFiles = _async(function* (
    this: HomeStore,
    { id, rootStore, selectedIds }: { id: string; rootStore: RootStore; selectedIds: string[] }
  ) {
    return yield* _await(
      handleErrors(async () => {
        const { fileStore, tagStore } = rootStore;

        const { excludedTagIds, optionalTagIds, requiredTagIds, requiredTagIdArrays } =
          tagStore.tagSearchOptsToIds(this.searchValue);

        const clickedIndex =
          (fileStore.page - 1) * CONSTANTS.FILE_COUNT +
          fileStore.files.findIndex((f) => f.id === id);

        const res = await trpc.getShiftSelectedFiles.mutate({
          ...this.getFilterProps(),
          clickedId: id,
          clickedIndex,
          excludedTagIds,
          requiredTagIds,
          requiredTagIdArrays,
          optionalTagIds,
          selectedIds,
        });
        if (!res.success) throw new Error(res.error);
        return res.data;
      })
    );
  });

  @modelFlow
  listIdsForCarousel = _async(function* (
    this: HomeStore,
    { id, rootStore }: { id: string; rootStore: RootStore }
  ) {
    return yield* _await(
      handleErrors(async () => {
        const { fileStore, tagStore } = rootStore;

        const { excludedTagIds, requiredTagIds, requiredTagIdArrays, optionalTagIds } =
          tagStore.tagSearchOptsToIds(this.searchValue);

        if (!id) throw new Error("Invalid ID provided");

        const res = await trpc.listFileIdsForCarousel.mutate({
          ...this.getFilterProps(),
          excludedTagIds,
          requiredTagIds,
          requiredTagIdArrays,
          optionalTagIds,
          page: fileStore.page,
          pageSize: CONSTANTS.FILE_COUNT,
        });
        if (!res.success) throw new Error(res.error);
        if (!res.data?.length) throw new Error("No files found");

        return res.data;
      })
    );
  });

  @modelFlow
  loadFilteredFiles = _async(function* (this: HomeStore, { page }: { page?: number } = {}) {
    return yield* _await(
      handleErrors(async () => {
        const debug = false;

        const rootStore = getRootStore<RootStore>(this);
        if (!rootStore) throw new Error("RootStore not found");
        const { fileStore, tagStore } = rootStore;

        const { perfLog, perfLogTotal } = makePerfLog("[LFF]");

        const { excludedTagIds, optionalTagIds, requiredTagIds, requiredTagIdArrays } =
          tagStore.tagSearchOptsToIds(this.searchValue);

        const filteredRes = await trpc.listFilteredFiles.mutate({
          ...this.getFilterProps(),
          excludedTagIds,
          requiredTagIds,
          requiredTagIdArrays,
          optionalTagIds,
          page: page ?? fileStore.page,
          pageSize: CONSTANTS.FILE_COUNT,
        });
        if (!filteredRes.success) throw new Error(filteredRes.error);

        const { files, pageCount } = filteredRes.data;
        if (debug) perfLog(`Loaded ${files.length} filtered files`);

        fileStore.overwrite(files);
        if (debug) perfLog("FileStore.files overwrite and re-render");

        fileStore.setPageCount(pageCount);
        if (page) fileStore.setPage(page);
        if (debug) perfLog(`Set page to ${page ?? fileStore.page} and pageCount to ${pageCount}`);

        if (debug) perfLogTotal(`Loaded ${files.length} files`);

        return files;
      })
    );
  });

  /* --------------------------------- DYNAMIC GETTERS -------------------------------- */
  getFilterProps() {
    return {
      includeTagged: this.includeTagged,
      includeUntagged: this.includeUntagged,
      isArchived: this.isArchiveOpen,
      isSortDesc: this.sortValue.isDesc,
      searchValue: this.searchValue,
      selectedImageTypes: this.selectedImageTypes,
      selectedVideoTypes: this.selectedVideoTypes,
      sortKey: this.sortValue.key,
    };
  }
}
