import { Model, model, prop } from "mobx-keystone";

@model("medior/TagMergerStore")
export class TagMergerStore extends Model({
  isOpen: prop<boolean>(false).withSetter(),
  tagId: prop<string>(null).withSetter(),
}) {}
