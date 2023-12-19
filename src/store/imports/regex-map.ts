import { reaction } from "mobx";
import { applySnapshot, getSnapshot, model, Model, modelAction, prop } from "mobx-keystone";

export type RegExMapType = "diffusionToTags" | "fileToTags" | "folderToCollection" | "folderToTags";

@model("mediaViewer/RegExMap")
export class RegExMap extends Model({
  hasUnsavedChanges: prop<boolean>(false),
  id: prop<string | null>(null),
  isDeleted: prop<boolean>(false),
  regEx: prop<string>("").withSetter(),
  tagIds: prop<string[]>(() => []).withSetter(),
  testString: prop<string>("").withSetter(),
  title: prop<string>("").withSetter(),
  type: prop<RegExMapType>(),
}) {
  /* -------------------------------- REACTIONS ------------------------------- */
  constructor(props: Partial<typeof RegExMap> & { delimiter?: string; type: RegExMapType }) {
    super(props);
    reaction(
      () => [this.isDeleted, this.regEx, this.tagIds.length, this.testString, this.title],
      () => {
        this.hasUnsavedChanges = true;
      }
    );
  }

  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  toggleDeleted() {
    this.isDeleted = !this.isDeleted;
  }

  @modelAction
  update(updates: Partial<RegExMap>) {
    applySnapshot(this, { ...getSnapshot(this), ...updates });
  }
}
