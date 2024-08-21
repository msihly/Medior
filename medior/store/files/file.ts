import { computed } from "mobx";
import {
  applySnapshot,
  ExtendedModel,
  getSnapshot,
  model,
  modelAction,
  ModelCreationData,
  prop,
} from "mobx-keystone";
import { _File } from "medior/store/_generated";
import { dayjs, getConfig, PLAYABLE_VIDEO_TYPES } from "medior/utils";

@model("medior/File")
export class File extends ExtendedModel(_File, {
  hasFaceModels: prop<boolean>(false),
}) {
  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  update(file: Partial<ModelCreationData<File>>) {
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
      .concat(addedTagIds?.filter?.((tagId) => !this.tagIds.includes(tagId)) ?? []);
    this.dateModified = dateModified;
  }

  /* ----------------------------- GETTERS ----------------------------- */
  @computed
  get isAnimated() {
    const regExp = new RegExp(`gif|${getConfig().file.videoTypes.join("|")}`, "i");
    return regExp.test(this.ext);
  }

  @computed
  get isPlayableVideo() {
    const regExp = new RegExp(`${PLAYABLE_VIDEO_TYPES.join("|")}`, "i");
    return regExp.test(this.ext);
  }

  @computed
  get isVideo() {
    const regExp = new RegExp(`${getConfig().file.videoTypes.join("|")}`, "i");
    return regExp.test(this.ext);
  }

  @computed
  get totalFrames() {
    return this.frameRate * this.duration;
  }
}
