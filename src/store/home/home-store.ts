import { Model, _async, _await, model, modelAction, modelFlow, prop } from "mobx-keystone";
import { RootStore, TagOption, mongoFileToMobX } from "store";
import {
  CONSTANTS,
  IMAGE_TYPES,
  ImageType,
  VIDEO_TYPES,
  VideoType,
  dayjs,
  handleErrors,
  round,
  trpc,
} from "utils";

const NUMERICAL_ATTRIBUTES = ["count", "duration", "height", "rating", "size", "width"];

export type ReloadDisplayedFilesInput = {
  rootStore: RootStore;
  page?: number;
  withOverwrite?: boolean;
};

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
  fileCardFit: prop<"contain" | "cover">("cover").withSetter(),
  includeTagged: prop<boolean>(false).withSetter(),
  includeUntagged: prop<boolean>(false).withSetter(),
  isArchiveOpen: prop<boolean>(false).withSetter(),
  isDraggingIn: prop<boolean>(false).withSetter(),
  isDraggingOut: prop<boolean>(false).withSetter(),
  isDrawerOpen: prop<boolean>(true).withSetter(),
  isTaggerOpen: prop<boolean>(false).withSetter(),
  searchValue: prop<TagOption[]>(() => []).withSetter(),
  selectedImageTypes: prop<SelectedImageTypes>(
    () => Object.fromEntries(IMAGE_TYPES.map((ext) => [ext, true])) as SelectedImageTypes
  ),
  selectedVideoTypes: prop<SelectedVideoTypes>(
    () => Object.fromEntries(VIDEO_TYPES.map((ext) => [ext, true])) as SelectedVideoTypes
  ),
  sortValue: prop<{ isDesc: boolean; key: string }>(() => ({
    isDesc: true,
    key: "dateModified",
  })).withSetter(),
  taggerBatchId: prop<string | null>(null).withSetter(),
  taggerFileIds: prop<string[]>(() => []).withSetter(),
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
        const { tagStore } = rootStore;

        const { excludedAnyTagIds, includedAllTagIds, includedAnyTagIds } =
          tagStore.tagSearchOptsToIds(this.searchValue);

        const res = await trpc.getShiftSelectedFiles.mutate({
          clickedId: id,
          excludedAnyTagIds,
          includedAllTagIds,
          includedAnyTagIds,
          includeTagged: this.includeTagged,
          includeUntagged: this.includeUntagged,
          isArchived: this.isArchiveOpen,
          isSortDesc: this.sortValue.isDesc,
          selectedIds,
          selectedImageTypes: this.selectedImageTypes,
          selectedVideoTypes: this.selectedVideoTypes,
          sortKey: this.sortValue.key,
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
        const { tagStore } = rootStore;

        const { excludedAnyTagIds, includedAllTagIds, includedAnyTagIds } =
          tagStore.tagSearchOptsToIds(this.searchValue);

        if (!id) throw new Error("Invalid ID provided");

        const res = await trpc.listFileIdsForCarousel.mutate({
          clickedId: id,
          excludedAnyTagIds,
          includedAllTagIds,
          includedAnyTagIds,
          includeTagged: this.includeTagged,
          includeUntagged: this.includeUntagged,
          isArchived: this.isArchiveOpen,
          isSortDesc: this.sortValue.isDesc,
          selectedImageTypes: this.selectedImageTypes,
          selectedVideoTypes: this.selectedVideoTypes,
          sortKey: this.sortValue.key,
        });
        if (!res.success) throw new Error(res.error);
        if (!res.data?.length) throw new Error("No files found");

        return res.data;
      })
    );
  });

  @modelFlow
  reloadDisplayedFiles = _async(function* (
    this: HomeStore,
    { rootStore, page }: ReloadDisplayedFilesInput = { rootStore: null }
  ) {
    return yield* _await(
      handleErrors(async () => {
        const logTag = "[RDF]";
        const funcPerfStart = performance.now();

        let perfStart = performance.now();
        const perfLog = (str: string) => {
          console.debug(logTag, round(performance.now() - perfStart, 0), "ms -", str);
          perfStart = performance.now();
        };

        const { fileStore, tagStore } = rootStore;

        const { excludedAnyTagIds, includedAllTagIds, includedAnyTagIds } =
          tagStore.tagSearchOptsToIds(this.searchValue);

        const filteredRes = await trpc.listFilteredFileIds.mutate({
          excludedAnyTagIds,
          includedAllTagIds,
          includedAnyTagIds,
          includeTagged: this.includeTagged,
          includeUntagged: this.includeUntagged,
          isArchived: this.isArchiveOpen,
          isSortDesc: this.sortValue.isDesc,
          page: page ?? fileStore.page,
          pageSize: CONSTANTS.FILE_COUNT,
          selectedImageTypes: this.selectedImageTypes,
          selectedVideoTypes: this.selectedVideoTypes,
          sortKey: this.sortValue.key,
        });
        if (!filteredRes.success) throw new Error(filteredRes.error);

        const { displayedIds, deselectedIds, pageCount } = filteredRes.data;
        perfLog(`Loaded ${displayedIds.length} displayed fileIds`); // DEBUG

        const displayedRes = await trpc.listFiles.mutate({ ids: displayedIds });
        if (!displayedRes.success) throw new Error(displayedRes.error);
        const displayed = displayedRes.data.sort((a, b) =>
          sortFiles({ a, b, isDesc: this.sortValue.isDesc, key: this.sortValue.key })
        );
        perfLog(`Loaded ${displayed.length} displayed files`); // DEBUG

        perfLog("Set filtered file IDs"); // DEBUG
        fileStore.overwrite(displayed.map(mongoFileToMobX));
        perfLog("FileStore.files overwrite"); // DEBUG

        if (page) fileStore.setPage(page);
        fileStore.setPageCount(pageCount);
        perfLog(`Set page to ${page ?? fileStore.pageCount} and pageCount to ${pageCount}`); // DEBUG

        fileStore.toggleFilesSelected(deselectedIds.map((id) => ({ id, isSelected: false })));
        perfLog(`${deselectedIds.length} files deselected`); // DEBUG

        console.debug(
          `Loaded ${displayed.length} displayed files in ${performance.now() - funcPerfStart}ms.`
        );

        return displayed;
      })
    );
  });
}
