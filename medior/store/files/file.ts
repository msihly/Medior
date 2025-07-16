import { TagSchema } from "medior/_generated";
import { computed } from "mobx";
import {
  applySnapshot,
  ExtendedModel,
  getSnapshot,
  model,
  modelAction,
  ModelCreationData,
  modelFlow,
  prop,
} from "mobx-keystone";
import { _File } from "medior/store/_generated";
import { asyncAction } from "medior/store";
import { getIsVideo } from "medior/utils/client";
import { dayjs, WEB_VIDEO_CODECS, WEB_VIDEO_EXTS } from "medior/utils/common";
import { trpc } from "medior/utils/server";

@model("medior/File")
export class File extends ExtendedModel(_File, {
  hasFaceModels: prop<boolean>(false),
  tags: prop<TagSchema[]>(() => []).withSetter(),
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

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  reload = asyncAction(async () => {
    const res = await trpc.listFile.mutate({ args: { filter: { id: this.id } } });
    if (!res.success) throw new Error(res.error);
    this.update(res.data.items[0]);
  });

  @modelFlow
  reloadTags = asyncAction(async () => {
    const res = await trpc.listTag.mutate({ args: { filter: { id: this.tagIds }}})
    if (!res.success) throw new Error(res.error);
    this.setTags(res.data.items);
  });

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
