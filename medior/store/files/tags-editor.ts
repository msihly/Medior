import autoBind from "auto-bind";
import { Model, model, prop } from "mobx-keystone";

@model("medior/FileTagsEditorStore")
export class FileTagsEditorStore extends Model({
  fileIds: prop<string[]>(() => []).withSetter(),
  isOpen: prop<boolean>(false).withSetter(),
}) {
  onInit() {
    autoBind(this);
  }
}
