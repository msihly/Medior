import { computed } from "mobx";
import { applySnapshot, getSnapshot, model, Model, modelAction, prop } from "mobx-keystone";
import { FileImport } from ".";
import { dayjs, DayJsInput } from "src/utils";

@model("medior/ImportBatch")
export class ImportBatch extends Model({
  collectionId: prop<string>(null).withSetter(),
  collectionTitle: prop<string>(null).withSetter(),
  completedAt: prop<string>(null),
  createdAt: prop<string>(),
  deleteOnImport: prop<boolean>(),
  id: prop<string>(),
  ignorePrevDeleted: prop<boolean>(),
  imports: prop<FileImport[]>(() => []),
  rootFolderPath: prop<string>(),
  startedAt: prop<string>(null),
  tagIds: prop<string[]>(),
}) {
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
  update(batch: Partial<ImportBatch>) {
    applySnapshot(this, { ...getSnapshot(this), ...batch });
  }

  @modelAction
  updateImport(filePath: string, updates: Partial<FileImport>) {
    const index = this.imports.findIndex((imp) => imp.path === filePath);
    this.imports[index].update(updates);
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
