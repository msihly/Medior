import { computed } from "mobx";
import { getRootStore, Model, model, modelAction, prop } from "mobx-keystone";
import { File, ImageType, IMAGE_TYPES, RootStore, TagOption, VideoType, VIDEO_TYPES } from "store";
import { sortArray } from "utils";

const NUMERICAL_ATTRIBUTES = ["rating", "size"];
const ROW_COUNT = 40;

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
  get sortedFiles() {
    const { fileStore } = getRootStore<RootStore>(this);
    return sortArray(
      fileStore.files,
      this.sortKey,
      this.isSortDesc,
      NUMERICAL_ATTRIBUTES.includes(this.sortKey)
    ) as File[];
  }

  @computed
  get filteredFiles() {
    const excludedTagIds = this.excludedTags.map((t) => t.id);
    const includedTagIds = this.includedTags.map((t) => t.id);

    return this.sortedFiles.filter((f) => {
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
    });
  }

  @computed
  get displayedFiles() {
    return this.filteredFiles.slice((this.page - 1) * ROW_COUNT, this.page * ROW_COUNT);
  }

  @computed
  get pageCount() {
    return this.filteredFiles.length < ROW_COUNT
      ? 1
      : Math.ceil(this.filteredFiles.length / ROW_COUNT);
  }
}
