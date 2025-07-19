import { Model, model, prop } from "mobx-keystone";

@model("medior/TagEditorStore")
export class TagEditorStore extends Model({
  isOpen: prop<boolean>(false).withSetter(),
  tagId: prop<string>(null).withSetter(),
}) {
