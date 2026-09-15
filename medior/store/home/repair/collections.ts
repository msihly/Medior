import autoBind from "auto-bind";
import { Model, model, prop } from "mobx-keystone";

@model("medior/RepairCollectionsStore")
export class RepairCollectionsStore extends Model({
  deleteDuplicates: prop<boolean>(true).withSetter(),
  deleteEmpty: prop<boolean>(true).withSetter(),
  deleteSubsets: prop<boolean>(true).withSetter(),
  enabled: prop<boolean>(false).withSetter(),
  fileIndexes: prop<boolean>(true).withSetter(),
  fileMembership: prop<boolean>(true).withSetter(),
}) {
  onInit() {
    autoBind(this);
  }

  /* ----------------------------- DYNAMIC GETTERS ---------------------------- */
  get isSelected() {
    return (
      this.enabled &&
      (this.deleteDuplicates ||
        this.deleteEmpty ||
        this.deleteSubsets ||
        this.fileIndexes ||
        this.fileMembership)
    );
  }
}
