import { RegExMapType } from "database";
import { reaction } from "mobx";
import { model, Model, modelAction, prop } from "mobx-keystone";

@model("mediaViewer/RegExMap")
export class RegExMap extends Model({
  hasUnsavedChanges: prop<boolean>(false),
  id: prop<string | null>(null),
  isDeleted: prop<boolean>(false),
  regEx: prop<string>("").withSetter(),
  tagId: prop<string | null>(null).withSetter(),
  testString: prop<string>("").withSetter(),
  types: prop<RegExMapType[]>(() => []).withSetter(),
}) {
  /* -------------------------------- REACTIONS ------------------------------- */
  constructor(props: Partial<RegExMap>) {
    super(props);
    reaction(
      () => [this.isDeleted, this.regEx, this.tagId, this.testString, this.types.length],
      () => {
        if (!this.hasUnsavedChanges) this.hasUnsavedChanges = true;
      }
    );
  }

  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  toggleDeleted() {
    this.isDeleted = !this.isDeleted;
  }

  @modelAction
  toggleType(type: RegExMapType) {
    this.types = this.types.includes(type)
      ? this.types.filter((t) => t !== type)
      : [...this.types, type];
  }
}
