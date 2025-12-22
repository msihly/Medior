import autoBind from "auto-bind";
import { TagSchema } from "medior/_generated";
import { ExtendedModel, model, modelFlow, prop } from "mobx-keystone";
import { _FileCollection } from "medior/store/_generated";
import { asyncAction } from "medior/store/utils";
import { trpc } from "medior/utils/server";

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
    const res = await trpc.listTag.mutate({ args: { filter: { id: this.tagIds } } });
    if (!res.success) throw new Error(res.error);
    this.setTags(res.data.items);
  });

  /* ----------------------------- DYNAMIC GETTERS ---------------------------- */
  getIndexById(id: string) {
    return this.fileIdIndexes.find((f) => f.fileId === id)?.index;
  }

  /* --------------------------------- GETTERS -------------------------------- */
  get previewIds() {
    return [...this.fileIdIndexes]
      .sort((a, b) => a.index - b.index)
      .slice(0, 8)
      .map((f) => f.fileId);
  }
}
