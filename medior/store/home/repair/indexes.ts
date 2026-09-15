import autoBind from "auto-bind";
import { Model, model, prop } from "mobx-keystone";

@model("medior/RepairIndexesStore")
export class RepairIndexesStore extends Model({
  enabled: prop<boolean>(false).withSetter(),
  rebuild: prop<boolean>(true).withSetter(),
  sync: prop<boolean>(true).withSetter(),
}) {
  onInit() {
    autoBind(this);
  }

  /* ----------------------------- DYNAMIC GETTERS ---------------------------- */
  get isSelected() {
    return this.enabled && (this.rebuild || this.sync);
  }
}
