import { Model, _async, _await, model, modelAction, modelFlow, prop } from "mobx-keystone";
import { RootStore, TagOption, mongoFileToMobX, tagsToDescendants } from "store";
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

export const sortFn = <File>({
  a,
  b,
  isSortDesc,
  sortKey,
}: {
  a: File;
  b: File;
  isSortDesc: boolean;
  sortKey: string;
}) => {
  const first = a[sortKey];
  const second = b[sortKey];

  let comparison: number = null;
  if (!first) comparison = 1;
  else if (!second) comparison = -1;
  else if (NUMERICAL_ATTRIBUTES.includes(sortKey)) comparison = second - first;
  else if (["dateCreated", "dateModified"].includes(sortKey))
    comparison = dayjs(second).isBefore(first) ? -1 : 1;
  else comparison = String(second).localeCompare(String(first));

  return isSortDesc ? comparison : comparison * -1;
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
  isSortDesc: prop<boolean>(true).withSetter(),
  isTaggerOpen: prop<boolean>(false).withSetter(),
  searchValue: prop<TagOption[]>(() => []).withSetter(),
  selectedImageTypes: prop<SelectedImageTypes>(
    () => Object.fromEntries(IMAGE_TYPES.map((ext) => [ext, true])) as SelectedImageTypes
  ),
  selectedVideoTypes: prop<SelectedVideoTypes>(
    () => Object.fromEntries(VIDEO_TYPES.map((ext) => [ext, true])) as SelectedVideoTypes
  ),
  sortKey: prop<string>("dateModified").withSetter(),
  taggerBatchId: prop<string | null>(null).withSetter(),
  taggerFileIds: prop<string[]>(() => []).withSetter(),
  tagSearchDepth: prop<number>(-1).withSetter(),
  tagSearchHasSections: prop<boolean>(false).withSetter(),
  tagSearchSortIsDesc: prop<boolean>(true).withSetter(),
  tagSearchSortKey: prop<string>("count").withSetter(),
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

        const tagsToIds = (tags: TagOption[], withDesc = false) => {
          const tagIds = tags.map((t) => t.id);
          return [
            ...tagIds,
            ...(withDesc ? tagsToDescendants(tagStore, tagStore.listByIds(tagIds)) : []),
          ];
        };

        const excludedAnyTagIds = [
          ...tagsToIds(this.searchValue.filter((t) => t.searchType === "exclude")),
          ...tagsToIds(
            this.searchValue.filter((t) => t.searchType === "excludeDesc"),
            true
          ),
        ];

        const includedAnyTagIds = [
          ...tagsToIds(this.searchValue.filter((t) => t.searchType === "includeOr")),
          ...tagsToIds(
            this.searchValue.filter((t) => t.searchType === "includeDesc"),
            true
          ),
        ];

        const includedAllTagIds = tagsToIds(
          this.searchValue.filter((t) => t.searchType === "includeAnd")
        );

        const filteredRes = await trpc.listFilteredFileIds.mutate({
          excludedAnyTagIds,
          includedAllTagIds,
          includedAnyTagIds,
          includeTagged: this.includeTagged,
          includeUntagged: this.includeUntagged,
          isArchived: this.isArchiveOpen,
          isSortDesc: this.isSortDesc,
          selectedImageTypes: this.selectedImageTypes,
          selectedVideoTypes: this.selectedVideoTypes,
          sortKey: this.sortKey,
        });
        if (!filteredRes.success) throw new Error(filteredRes.error);
        const filteredIds = filteredRes.data;
        perfLog(`Loaded ${filteredIds.length} filtered files`); // DEBUG

        const displayedIds = filteredIds.slice(
          ((page ?? fileStore.page) - 1) * CONSTANTS.FILE_COUNT,
          (page ?? fileStore.page) * CONSTANTS.FILE_COUNT
        );

        const displayedRes = await trpc.listFiles.mutate({ ids: displayedIds });
        if (!displayedRes.success) throw new Error(displayedRes.error);
        const displayed = displayedRes.data.sort((a, b) =>
          sortFn({ a, b, isSortDesc: this.isSortDesc, sortKey: this.sortKey })
        );
        perfLog(`Loaded ${displayed.length} displayed files`); // DEBUG

        fileStore.setFilteredFileIds(filteredIds);
        perfLog("Set filtered file IDs"); // DEBUG
        fileStore.overwrite(displayed.map(mongoFileToMobX));
        perfLog("FileStore.files overwrite"); // DEBUG

        if (page) {
          fileStore.setPage(page);
          perfLog(`Set page to ${page}`); // DEBUG
        }

        const deselectedIds = fileStore.selectedIds.reduce((acc, cur) => {
          if (!filteredIds.includes(cur)) acc.push({ id: cur, isSelected: false });
          return acc;
        }, [] as { id: string; isSelected: boolean }[]);

        fileStore.toggleFilesSelected(deselectedIds);
        perfLog(`${deselectedIds.length} files deselected`); // DEBUG

        console.debug(
          `Loaded ${displayed.length} displayed files in ${performance.now() - funcPerfStart}ms.`
        );

        return displayed;
      })
    );
  });
}
