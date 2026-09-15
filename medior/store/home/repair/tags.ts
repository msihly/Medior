import autoBind from "auto-bind";
import { Model, model, prop } from "mobx-keystone";

@model("medior/RepairTagsStore")
export class RepairTagsStore extends Model({
  decodeLabels: prop<boolean>(true).withSetter(),
  enabled: prop<boolean>(false).withSetter(),
  hierarchy: prop<boolean>(true).withSetter(),
  mergeDuplicates: prop<boolean>(true).withSetter(),
  metadata: prop<boolean>(true).withSetter(),
}) {
  onInit() {
    autoBind(this);
  }

  /* ----------------------------- DYNAMIC GETTERS ---------------------------- */
  get isSelected() {
    return (
      this.enabled && (this.decodeLabels || this.hierarchy || this.mergeDuplicates || this.metadata)
    );
  }
}
