import autoBind from "auto-bind";
import { Model, model, prop } from "mobx-keystone";
import { TagOption } from "medior/store/tags/tag";

@model("medior/TagMergerStore")
export class TagMergerStore extends Model({
  isOpen: prop<boolean>(false).withSetter(),
  mergeTag: prop<TagOption>(null).withSetter(),
  tagId: prop<string>(null).withSetter(),
}) {
  onInit() {
    autoBind(this);
  }
}
