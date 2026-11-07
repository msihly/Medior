import autoBind from "auto-bind";
import { TagSchema } from "medior/_generated/server";
import { computed } from "mobx";
import { ExtendedModel, model, prop } from "mobx-keystone";
import { _MediaProgram } from "medior/store/_generated";
import { getMediaProgramEpisodeIds } from "medior/utils/common";

@model("medior/MediaProgram")
export class MediaProgram extends ExtendedModel(_MediaProgram, {
  genres: prop<TagSchema[]>(() => []).withSetter(),
  tags: prop<TagSchema[]>(() => []).withSetter(),
}) {
  onInit() {
    autoBind(this);
  }

  /* --------------------------------- GETTERS -------------------------------- */
  /** Every episode in season order; a file in several seasons plays once. */
  @computed
  get episodeIds() {
    return getMediaProgramEpisodeIds(this.seasons);
  }

  /** Episode marks for the active rewatch, or for the original watch when not rewatching. */
  @computed
  get watchedIdSet() {
    return new Set(this.isRewatching ? this.rewatchedFileIds : this.watchedFileIds);
  }
}
