import { computed } from "mobx";
import {
  applySnapshot,
  getRootStore,
  getSnapshot,
  Model,
  model,
  modelAction,
  prop,
} from "mobx-keystone";
import { getTagAncestry, RootStore } from "store";
import { dayjs } from "utils";

export const IMAGE_TYPES = ["jpg", "jpeg", "png", "gif", "webp", "jif", "jiff", "jfif"] as const;
export type ImageType = typeof IMAGE_TYPES[number];
export const IMAGE_EXT_REG_EXP = new RegExp(`${IMAGE_TYPES.join("|")}`, "i");

export const VIDEO_TYPES = ["webm", "mp4", "mkv"] as const;
export type VideoType = typeof VIDEO_TYPES[number];
export const VIDEO_EXT_REG_EXP = new RegExp(`${VIDEO_TYPES.join("|")}`, "i");
export const ANIMATED_EXT_REG_EXP = new RegExp(`gif|${VIDEO_TYPES.join("|")}`, "i");

@model("mediaViewer/File")
export class File extends Model({
  dateCreated: prop<string>(),
  dateModified: prop<string>(),
  duration: prop<number>(null),
  ext: prop<string>(),
  frameRate: prop<number>(null),
  hash: prop<string>(),
  height: prop<number>(),
  id: prop<string>(),
  isArchived: prop<boolean>(),
  isSelected: prop<boolean>(),
  originalHash: prop<string>(null),
  originalName: prop<string>(null),
  originalPath: prop<string>(),
  path: prop<string>(),
  rating: prop<number>(),
  size: prop<number>(),
  tagIds: prop<string[]>(null),
  thumbPaths: prop<string[]>(null),
  width: prop<number>(),
}) {
  @modelAction
  update(file: Partial<File>) {
    applySnapshot(this, { ...getSnapshot(this), ...file });
  }

  @modelAction
  updateTags(tagIds: string[], dateModified = dayjs().toISOString()) {
    this.tagIds = tagIds;
    this.dateModified = dateModified;
  }

  @computed
  get collections() {
    const { fileCollectionStore } = getRootStore<RootStore>(this);
    return fileCollectionStore.listByFileId(this.id);
  }

  @computed
  get isAnimated() {
    return ANIMATED_EXT_REG_EXP.test(this.ext);
  }

  @computed
  get isVideo() {
    return VIDEO_EXT_REG_EXP.test(this.ext);
  }

  @computed
  get tags() {
    const { tagStore } = getRootStore<RootStore>(this);
    return this.tagIds.map((id) => tagStore.getById(id));
  }

  @computed
  get tagAncestry() {
    return [...new Set(getTagAncestry(this.tags))];
  }

  @computed
  get totalFrames() {
    return this.frameRate * this.duration;
  }
}
