import { Model, model, prop } from "mobx-keystone";

@model("medior/FileTagsEditorStore")
export class FileTagsEditorStore extends Model({
  batchId: prop<string>(null).withSetter(),
  fileIds: prop<string[]>(() => []).withSetter(),
  isOpen: prop<boolean>(false).withSetter(),
}) {}
