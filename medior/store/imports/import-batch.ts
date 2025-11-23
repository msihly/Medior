import autoBind from "auto-bind";
import { computed } from "mobx";
import { ExtendedModel, model, modelAction, prop } from "mobx-keystone";
import { _FileImportBatch } from "medior/store/_generated";
import type { TagToUpsert } from "medior/components";
import { FileImport } from ".";

@model("medior/FileImportBatch")
export class FileImportBatch extends ExtendedModel(_FileImportBatch, {
  tags: prop<TagToUpsert[]>(() => []).withSetter(),
}) {
  onInit() {
    autoBind(this);
  }

  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  updateImport(paths: { originalPath?: string; newPath?: string }, updates: Partial<FileImport>) {
    const index = this.imports.findIndex((imp) =>
      [paths.newPath, paths.originalPath].includes(imp.path),
    );
    this.imports[index]?.update(updates);
  }

  /* ----------------------------- DYNAMIC GETTERS ---------------------------- */
  getByPath(filePath: string) {
    return this.imports.find((imp) => imp.path === filePath);
  }

  /* ------------------------------ GETTERS ----------------------------- */
  @computed
  get completed() {
    return this.imports.filter((imp) => ["COMPLETE", "DUPLICATE"].includes(imp.status));
  }

  @computed
  get imported() {
    return this.imports.filter((imp) => imp.status !== "PENDING");
  }
}
