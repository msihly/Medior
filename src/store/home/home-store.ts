import { Model, model, modelAction, prop } from "mobx-keystone";
import { ImageType, IMAGE_TYPES, TagOption, VideoType, VIDEO_TYPES } from "store";

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
}
