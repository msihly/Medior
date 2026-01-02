import autoBind from "auto-bind";
import { ExtendedModel, model, modelAction, prop } from "mobx-keystone";
import { _FileImport } from "medior/store/_generated";
import { TagToUpsert } from "medior/components";

@model("medior/FileImport")
export class FileImport extends ExtendedModel(_FileImport, {
  tagsToUpsert: prop<TagToUpsert[]>(() => []),
}) {
  onInit() {
    autoBind(this);
  }

  @modelAction
  addTagIds(tagIds: string[]) {
    for (const tagId of tagIds) {
      const existing = this.tagIds.find((id) => id === tagId);
      if (!existing) this.tagIds.push(tagId);
    }
  }

  @modelAction
  addTagsToUpsert(tagsToUpsert: TagToUpsert[]) {
    for (const tag of tagsToUpsert) {
      const existing = this.tagsToUpsert.find((t) => t.label === tag.label);
      if (!existing) this.tagsToUpsert.push(tag);
    }
  }

  @modelAction
  setDiffusionParams(diffusionParams: string) {
    if (diffusionParams !== this.diffusionParams) this.diffusionParams = diffusionParams;
  }
}
