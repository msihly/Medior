import { TagToUpsert } from "components";
import { applySnapshot, getSnapshot, model, Model, modelAction, prop } from "mobx-keystone";

@model("mediaViewer/FileImport")
export class FileImport extends Model({
  dateCreated: prop<string>(),
  diffusionParams: prop<string>(null),
  errorMsg: prop<string>(null),
  extension: prop<string>(),
  fileId: prop<string>(null),
  path: prop<string>(),
  name: prop<string>(),
  size: prop<number>(),
  status: prop<"COMPLETE" | "DUPLICATE" | "ERROR" | "PENDING">(),
  tagIds: prop<string[]>(() => []),
  tagsToUpsert: prop<TagToUpsert[]>(() => []),
  thumbPaths: prop<string[]>(() => []),
}) {
  @modelAction
  update(updates: Partial<FileImport>) {
    applySnapshot(this, { ...getSnapshot(this), ...updates });
  }
}
