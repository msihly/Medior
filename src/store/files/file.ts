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
import { RootStore } from "store";
import { ANIMATED_EXT_REG_EXP, dayjs, VIDEO_EXT_REG_EXP } from "utils";

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
  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  update(file: Partial<File>) {
    applySnapshot(this, { ...getSnapshot(this), ...file });
  }

  @modelAction
  updateTags({
    addedTagIds,
    dateModified = dayjs().toISOString(),
    removedTagIds,
  }: {
    addedTagIds?: string[];
    dateModified?: string;
    removedTagIds?: string[];
  }) {
    this.tagIds = this.tagIds
      .filter((tagId) => !removedTagIds?.includes(tagId))
      .concat(addedTagIds ?? []);
    this.dateModified = dateModified;
  }

  /* ----------------------------- GETTERS ----------------------------- */
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
    return this.tagIds.reduce((acc, cur) => {
      const tag = tagStore.getById(cur);
      if (tag) acc.push(tag);
      return acc;
    }, []);
  }

  @computed
  get totalFrames() {
    return this.frameRate * this.duration;
  }
}
