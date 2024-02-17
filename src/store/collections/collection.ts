import { applySnapshot, getSnapshot, Model, model, modelAction, prop } from "mobx-keystone";

export type FileIdIndex = {
  fileId: string;
  index: number;
};

@model("mediaViewer/FileCollection")
export class FileCollection extends Model({
  dateCreated: prop<string>(null),
  dateModified: prop<string>(null),
  fileIdIndexes: prop<FileIdIndex[]>(),
  id: prop<string>(),
  rating: prop<number>(0),
  tagIds: prop<string[]>(() => []),
  tagIdsWithAncestors: prop<string[]>(() => []),
  thumbPaths: prop<string[]>(() => []),
  title: prop<string>(),
}) {
  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  update(collection: Partial<FileCollection>) {
    applySnapshot(this, { ...getSnapshot(this), ...collection });
  }

  /* ----------------------------- DYNAMIC GETTERS ---------------------------- */
  getIndexById(id: string) {
    return this.fileIdIndexes.find((f) => f.fileId === id)?.index;
  }
}
