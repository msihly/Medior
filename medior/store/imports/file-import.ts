import autoBind from "auto-bind";
import { ExtendedModel, model, prop } from "mobx-keystone";
import { _FileImport } from "medior/store/_generated";
import { TagToUpsert } from "medior/components";
import { FileImportSidecar } from "medior/utils/common";

@model("medior/FileImport")
export class FileImport extends ExtendedModel(_FileImport, {
  sidecar: prop<FileImportSidecar>(null),
  tagsToUpsert: prop<TagToUpsert[]>(() => []),
}) {
  onInit() {
    autoBind(this);
  }
}
