import { Model, model, modelAction, prop } from "mobx-keystone";
import { TagOption } from "store";
import { dayjs, ImageType, IMAGE_TYPES, VideoType, VIDEO_TYPES } from "utils";

const NUMERICAL_ATTRIBUTES = ["duration", "height", "rating", "size", "width"];

type SelectedImageTypes = { [ext in ImageType]: boolean };
type SelectedVideoTypes = { [ext in VideoType]: boolean };

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
}
