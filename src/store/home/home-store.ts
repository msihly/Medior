import { computed } from "mobx";
import { getRootStore, Model, model, modelAction, prop } from "mobx-keystone";
import { RootStore, TagOption } from "store";
import { CONSTANTS, dayjs, ImageType, IMAGE_TYPES, VideoType, VIDEO_TYPES } from "utils";

const NUMERICAL_ATTRIBUTES = ["duration", "height", "rating", "size", "width"];

type SelectedImageTypes = { [ext in ImageType]: boolean };
type SelectedVideoTypes = { [ext in VideoType]: boolean };

@model("mediaViewer/HomeStore")
export class HomeStore extends Model({
  drawerMode: prop<"persistent" | "temporary">("persistent"),
  excludedTags: prop<TagOption[]>(() => []).withSetter(),
  includeDescendants: prop<boolean>(false).withSetter(),
  includeTagged: prop<boolean>(false).withSetter(),
  includeUntagged: prop<boolean>(false).withSetter(),
  includedTags: prop<TagOption[]>(() => []).withSetter(),
  isArchiveOpen: prop<boolean>(false).withSetter(),
  isDrawerOpen: prop<boolean>(true).withSetter(),
  isSortDesc: prop<boolean>(true).withSetter(),
  page: prop<number>(1).withSetter(),
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

  @computed
  get filteredFiles() {
    const excludedTagIds = this.excludedTags.map((t) => t.id);
    const includedTagIds = this.includedTags.map((t) => t.id);

    const { fileStore } = getRootStore<RootStore>(this);

    return fileStore.files
      .filter((f) => {
        if (this.isArchiveOpen !== f.isArchived) return false;

        const hasTags = f.tagIds?.length > 0;
        if (this.includeTagged && !hasTags) return false;
        if (this.includeUntagged && hasTags) return false;

        const parentTagIds = this.includeDescendants ? f.tagAncestry : [];

        const hasExcluded = excludedTagIds.some((tagId) => f.tagIds.includes(tagId));
        const hasExcludedParent = parentTagIds.some((tagId) => excludedTagIds.includes(tagId));

        const hasIncluded = includedTagIds.every((tagId) => f.tagIds.includes(tagId));
        const hasIncludedParent = parentTagIds.some((tagId) => includedTagIds.includes(tagId));

        const hasExt = !!Object.entries({
          ...this.selectedImageTypes,
          ...this.selectedVideoTypes,
        }).find(([key, value]) => key === f.ext.substring(1) && value);

        return (hasIncluded || hasIncludedParent) && !hasExcluded && !hasExcludedParent && hasExt;
      })
      .sort((a, b) => {
        const first = a[this.sortKey];
        const second = b[this.sortKey];

        let comparison: number = null;
        if (NUMERICAL_ATTRIBUTES.includes(this.sortKey)) comparison = second - first;
        else if (["dateCreated", "dateModified"].includes(this.sortKey))
          comparison = dayjs(second).isBefore(first) ? -1 : 1;
        else comparison = String(second).localeCompare(String(first));

        return this.isSortDesc ? comparison : comparison * -1;
      });
  }

  @computed
  get displayedFiles() {
    return this.filteredFiles.slice(
      (this.page - 1) * CONSTANTS.FILE_COUNT,
      this.page * CONSTANTS.FILE_COUNT
    );
  }
}
