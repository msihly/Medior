import { ExtendedModel, model, prop } from "mobx-keystone";
import { _FileImport } from "medior/store/_generated";
import { TagToUpsert } from "medior/components";

@model("medior/FileImport")
export class FileImport extends ExtendedModel(_FileImport, {
  tagsToUpsert: prop<TagToUpsert[]>(() => []),
}) {}
