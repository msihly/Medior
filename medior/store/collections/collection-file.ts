import { Model, model, prop } from "mobx-keystone";
import { File } from "medior/store";

@model("medior/FileCollectionFile")
export class FileCollectionFile extends Model({
  file: prop<File>(),
  /** id is required for SortableContext.items */
  id: prop<string>(),
  index: prop<number>(),
}) {}
