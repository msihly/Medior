import autoBind from "auto-bind";
import { TagSchema } from "medior/_generated/server";
import { computed } from "mobx";
import { ExtendedModel, model, modelFlow, prop } from "mobx-keystone";
import { _FileCollection } from "medior/store/_generated";
import { asyncAction, reloadItemTags } from "medior/utils/client";

@model("medior/FileCollection")
export class FileCollection extends ExtendedModel(_FileCollection, {
  tags: prop<TagSchema[]>(() => []).withSetter(),
}) {
  onInit() {
    autoBind(this);
  }

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  reloadTags = asyncAction(async () => {
    await reloadItemTags([this]);
  });

  /* --------------------------------- GETTERS -------------------------------- */
  @computed
  get previewIds() {
    return [...this.fileIdIndexes]
      .sort((a, b) => a.index - b.index)
      .slice(0, 8)
      .map((f) => f.fileId);
  }
}
