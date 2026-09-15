import autoBind from "auto-bind";
import { Model, model, prop } from "mobx-keystone";

@model("medior/RepairThumbnailsStore")
export class RepairThumbnailsStore extends Model({
  enabled: prop<boolean>(false).withSetter(),
  missing: prop<boolean>(true).withSetter(),
  ntfsMetadata: prop<boolean>(true).withSetter(),
  paths: prop<boolean>(true).withSetter(),
}) {
  onInit() {
    autoBind(this);
  }

  /* ----------------------------- DYNAMIC GETTERS ---------------------------- */
  get isSelected() {
    return this.enabled && (this.missing || this.ntfsMetadata || this.paths);
  }
}
