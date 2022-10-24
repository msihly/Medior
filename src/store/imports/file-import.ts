import { applySnapshot, getSnapshot, model, Model, modelAction, prop } from "mobx-keystone";

@model("mediaViewer/FileImport")
export class FileImport extends Model({
  dateCreated: prop<string>(),
  extension: prop<string>(),
  path: prop<string>(),
  name: prop<string>(),
  size: prop<number>(),
  status: prop<"COMPLETE" | "DUPLICATE" | "ERROR" | "PENDING">(),
}) {
  @modelAction
  update(fileImport: Partial<FileImport>) {
    applySnapshot(this, { ...getSnapshot(this), ...fileImport });
  }
}
