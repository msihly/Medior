import { Model, model, prop } from "mobx-keystone";
import { File } from "store";

@model("mediaViewer/FileCollectionFile")
export class FileCollectionFile extends Model({
  file: prop<File>(),
  /** id is required for SortableContext.items */
  id: prop<string>(),
  index: prop<number>(),
  isDeleted: prop<boolean>(false).withSetter(),
}) {}
