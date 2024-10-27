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
import { dayjs, getIsVideo, WEB_VIDEO_CODECS, WEB_VIDEO_EXTS } from "medior/utils";

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
    return this.isVideo || this.ext === "gif";
  }

  @computed
  get isWebPlayable() {
    return (
      WEB_VIDEO_CODECS.includes(this.videoCodec.toLowerCase()) &&
      WEB_VIDEO_EXTS.includes(this.ext.toLowerCase())
    );
  }

  @computed
  get isVideo() {
    return getIsVideo(this.ext);
  }

  @computed
  get totalFrames() {
    return this.frameRate * this.duration;
  }
}
