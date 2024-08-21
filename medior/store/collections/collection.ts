import { ExtendedModel, model } from "mobx-keystone";
import { _FileCollection } from "medior/store/_generated";

@model("medior/FileCollection")
export class FileCollection extends ExtendedModel(_FileCollection, {}) {
  /* ----------------------------- DYNAMIC GETTERS ---------------------------- */
  getIndexById(id: string) {
    return this.fileIdIndexes.find((f) => f.fileId === id)?.index;
  }
}
