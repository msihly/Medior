import { model, Model, prop } from "mobx-keystone";

@model("mediaViewer/FileImport")
export class FileImport extends Model({
  dateCreated: prop<string>(),
  errorMsg: prop<string>(null),
  extension: prop<string>(),
  fileId: prop<string>(null),
  path: prop<string>(),
  name: prop<string>(),
  size: prop<number>(),
  status: prop<"COMPLETE" | "DUPLICATE" | "ERROR" | "PENDING">(),
}) {}
