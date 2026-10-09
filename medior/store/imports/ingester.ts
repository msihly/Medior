import { ExtendedModel, model, modelAction, prop } from "mobx-keystone";
import { ImportEditorStore } from "./import-editor-store";

@model("medior/Ingester")
export class Ingester extends ExtendedModel(ImportEditorStore, {
  savedConfigFolderPaths: prop<string[]>(() => []).withSetter(),
}) {
  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  reset() {
    super.reset();

    this.savedConfigFolderPaths = [];
  }
}
