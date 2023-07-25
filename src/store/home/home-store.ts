import { Model, _async, _await, model, modelAction, modelFlow, prop } from "mobx-keystone";
import { RootStore, TagOption, tagsToDescendants } from "store";
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

const NUMERICAL_ATTRIBUTES = ["duration", "height", "rating", "size", "width"];

export type ReloadDisplayedFilesInput = {
  rootStore: RootStore;
  page?: number;
  withAppend?: boolean;
  withOverwrite?: boolean;
};

export type SelectedImageTypes = { [ext in ImageType]: boolean };
export type SelectedVideoTypes = { [ext in VideoType]: boolean };

export const sortFiles = ({ a, b, isSortDesc, sortKey }) => {
  const first = a[sortKey];
  const second = b[sortKey];

  let comparison: number = null;
  if (NUMERICAL_ATTRIBUTES.includes(sortKey)) comparison = second - first;
  else if (["dateCreated", "dateModified"].includes(sortKey))
    comparison = dayjs(second).isBefore(first) ? -1 : 1;
  else comparison = String(second).localeCompare(String(first));

  return isSortDesc ? comparison : comparison * -1;
};

@model("mediaViewer/HomeStore")
export class HomeStore extends Model({
  drawerMode: prop<"persistent" | "temporary">("persistent"),
  excludedAnyTags: prop<TagOption[]>(() => []).withSetter(),
  includeDescendants: prop<boolean>(true).withSetter(),
  includeTagged: prop<boolean>(false).withSetter(),
  includeUntagged: prop<boolean>(false).withSetter(),
  includedAllTags: prop<TagOption[]>(() => []).withSetter(),
  includedAnyTags: prop<TagOption[]>(() => []).withSetter(),
  isArchiveOpen: prop<boolean>(false).withSetter(),
  isDrawerOpen: prop<boolean>(true).withSetter(),
  isSortDesc: prop<boolean>(true).withSetter(),
  selectedImageTypes: prop<SelectedImageTypes>(
    () => Object.fromEntries(IMAGE_TYPES.map((ext) => [ext, true])) as SelectedImageTypes
  ),
  selectedVideoTypes: prop<SelectedVideoTypes>(
    () => Object.fromEntries(VIDEO_TYPES.map((ext) => [ext, true])) as SelectedVideoTypes
  ),
  sortKey: prop<string>("dateModified").withSetter(),
}) {
  @modelAction
  toggleDrawerMode() {
    this.drawerMode = this.drawerMode === "persistent" ? "temporary" : "persistent";
  }

  @modelAction
  setSelectedImageTypes(types: Partial<SelectedImageTypes>) {
    this.selectedImageTypes = { ...this.selectedImageTypes, ...types };
  }

  @modelAction
  setSelectedVideoTypes(types: Partial<SelectedVideoTypes>) {
    this.selectedVideoTypes = { ...this.selectedVideoTypes, ...types };
  }

  @modelFlow
  reloadDisplayedFiles = _async(function* (
    this: HomeStore,
    { rootStore, page, withAppend = true, withOverwrite = false }: ReloadDisplayedFilesInput = {
      rootStore: null,
    }
  ) {
    return yield* _await(
      handleErrors(async () => {
        const logTag = "[Reload Displayed Files]";
        const funcPerfStart = performance.now();

        let perfStart = performance.now();
        const perfLog = (str: string) => {
          console.debug(logTag, round(performance.now() - perfStart, 0), "ms.", str);
          perfStart = performance.now();
        };

        const { fileStore, tagStore } = rootStore;

        const tagsToIds = (tags: TagOption[]) => {
          const tagIds = tags.map((t) => t.id);
          const tagIdsWithDesc = [
            ...tagIds,
            ...(this.includeDescendants
              ? tagsToDescendants(tagStore, tagStore.listByIds(tagIds))
              : []),
          ];
          return [tagIds, tagIdsWithDesc];
        };

        const [excludedAnyTagIds, excludedAnyTagIdsDesc] = tagsToIds(this.excludedAnyTags);
        const [includedAllTagIds] = tagsToIds(this.includedAllTags);
        const [includedAnyTagIds, includedAnyTagIdsDesc] = tagsToIds(this.includedAnyTags);

        const filesRes = await trpc.listFilteredFiles.mutate({
          includeTagged: this.includeTagged,
          includeUntagged: this.includeUntagged,
          isArchived: this.isArchiveOpen,
          selectedImageTypes: this.selectedImageTypes,
          selectedVideoTypes: this.selectedVideoTypes,
        });
        if (!filesRes.success) throw new Error(filesRes.error);
        const files = filesRes.data;

        perfLog("Mongo find"); // DEBUG

        const filtered = files
          .filter((f) => {
            const hasTags = f.tagIds.length > 0;
            const hasExcludedAny =
              excludedAnyTagIds.length > 0
                ? hasTags && f.tagIds.some((tagId) => excludedAnyTagIdsDesc.includes(tagId))
                : false;
            const hasIncludedAll =
              includedAllTagIds.length > 0
                ? hasTags && includedAllTagIds.every((tagId) => f.tagIds.includes(tagId))
                : true;
            const hasIncludedAny =
              includedAnyTagIds.length > 0
                ? hasTags && f.tagIds.some((tagId) => includedAnyTagIdsDesc.includes(tagId))
                : true;
            return hasIncludedAll && hasIncludedAny && !hasExcludedAny;
          })
          .sort((a, b) => sortFiles({ a, b, isSortDesc: this.isSortDesc, sortKey: this.sortKey }));

        perfLog("Filtering and sorting"); // DEBUG

        if (withOverwrite) fileStore.overwrite(filtered);
        else if (withAppend) fileStore.appendFiltered(filtered, page);
        if (page) fileStore.setPage(page);

        perfLog(`${withOverwrite ? "Overwite" : "Append"}${page ? " and set page" : ""}`); // DEBUG

        const filteredIds = filtered.map((f) => f.id);
        const deselectedIds = fileStore.selectedIds.reduce((acc, cur) => {
          if (!filteredIds.includes(cur)) acc.push({ id: cur, isSelected: false });
          return acc;
        }, [] as { id: string; isSelected: boolean }[]);

        fileStore.toggleFilesSelected(deselectedIds);

        perfLog("File deselection"); // DEBUG

        const displayed = files.slice(
          ((page ?? fileStore.page) - 1) * CONSTANTS.FILE_COUNT,
          (page ?? fileStore.page) * CONSTANTS.FILE_COUNT
        );

        console.debug(
          `Loaded ${displayed.length} displayed files in ${performance.now() - funcPerfStart}ms.`
        );

        return displayed;
      })
    );
  });
}
