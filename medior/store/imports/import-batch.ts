import { computed } from "mobx";
import { ExtendedModel, model, modelAction } from "mobx-keystone";
import { _FileImportBatch } from "medior/store/_generated";
import { dayjs, DayJsInput } from "medior/utils/common";
import { FileImport } from ".";

@model("medior/FileImportBatch")
export class FileImportBatch extends ExtendedModel(_FileImportBatch, {}) {
  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  setCompletedAt(completedAt: DayJsInput) {
    this.completedAt = dayjs(completedAt).toISOString();
  }

  @modelAction
  setStartedAt(startedAt: DayJsInput) {
    this.startedAt = dayjs(startedAt).toISOString();
  }

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

  @computed
  get status() {
    return this.imports.some((imp) => imp.status === "PENDING")
      ? "PENDING"
      : this.imports.some((imp) => imp.status === "ERROR")
        ? "ERROR"
        : this.imports.some((imp) => imp.status === "DUPLICATE")
          ? "DUPLICATE"
          : !this.completedAt?.length
            ? "PENDING"
            : "COMPLETE";
  }
}
