import autoBind from "auto-bind";
import { Model, model, prop } from "mobx-keystone";

@model("medior/RepairFilesStore")
export class RepairFilesStore extends Model({
  codecs: prop<boolean>(true).withSetter(),
  enabled: prop<boolean>(false).withSetter(),
  extensions: prop<boolean>(true).withSetter(),
  originalInfo: prop<boolean>(true).withSetter(),
}) {
  onInit() {
    autoBind(this);
  }

  /* ----------------------------- DYNAMIC GETTERS ---------------------------- */
  get isSelected() {
    return this.enabled && (this.codecs || this.extensions || this.originalInfo);
  }
}
