import autoBind from "auto-bind";
import { TagSchema } from "medior/_generated/server";
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
import { asyncAction } from "medior/utils/client";
import { CONSTANTS, dayjs, WebVideoCodec, WebVideoExt } from "medior/utils/common";
import { getIsVideo, trpc } from "medior/utils/server";

const WEB_AUDIO_CODECS: Record<string, string> = {
  aac: "mp4a.40.2",
  flac: "flac",
  mp3: "mp3",
  opus: "opus",
  vorbis: "vorbis",
};
const WEB_VIDEO_CODECS: Record<string, string> = {
  av1: "av01.0.04M.08",
  h264: "avc1.42E01E",
  hevc: "hvc1.1.6.L93.B0",
  theora: "theora",
  vp8: "vp8",
  vp9: "vp09.00.10.08",
};

@model("medior/File")
export class File extends ExtendedModel(_File, {
  hasFaceModels: prop<boolean>(false),
  tags: prop<TagSchema[]>(() => []).withSetter(),
}) {
  onInit() {
    autoBind(this);
  }

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
    const res = await trpc.listTag.mutate({ filter: { id: this.tagIds } });
    if (!res.success) throw new Error(res.error);
    this.setTags(res.data);
  });

  /* ----------------------------- GETTERS ----------------------------- */
  @computed
  get isAnimated() {
    return this.isVideo || this.ext === "gif";
  }

  @computed
  get isWebPlayable() {
    const audioCodec = this.audioCodec?.toLowerCase();
    return (
      CONSTANTS.WEB_VIDEO.CODECS.includes(this.videoCodec?.toLowerCase() as WebVideoCodec) &&
      CONSTANTS.WEB_VIDEO.EXTS.includes(this.ext?.toLowerCase() as WebVideoExt) &&
      (!audioCodec || audioCodec === "none" || Boolean(WEB_AUDIO_CODECS[audioCodec])) &&
      Boolean(
        document
          .createElement("video")
          .canPlayType(
            `video/${this.ext === "ogv" ? "ogg" : this.ext}; codecs="${[WEB_VIDEO_CODECS[this.videoCodec?.toLowerCase()], WEB_AUDIO_CODECS[audioCodec]].filter(Boolean).join(",")}"`,
          ),
      )
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
