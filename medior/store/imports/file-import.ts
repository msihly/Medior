import { ExtendedModel, model, modelAction, prop } from "mobx-keystone";
import { _FileImport } from "medior/store/_generated";
import { TagToUpsert } from "medior/components";
import { isDeepEqual } from "medior/utils/common";

@model("medior/FileImport")
export class FileImport extends ExtendedModel(_FileImport, {
  tagsToUpsert: prop<TagToUpsert[]>(() => []),
}) {
  @modelAction
  setDiffusionParams(diffusionParams: string) {
    if (diffusionParams !== this.diffusionParams) this.diffusionParams = diffusionParams;
  }

  @modelAction
  setTags(tagIds: string[], tagsToUpsert: TagToUpsert[]) {
    if (!isDeepEqual(tagIds, this.tagIds)) this.tagIds = tagIds;
    if (!isDeepEqual(tagsToUpsert, this.tagsToUpsert)) this.tagsToUpsert = tagsToUpsert;
  }
}
