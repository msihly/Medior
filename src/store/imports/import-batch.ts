import { computed } from "mobx";
import {
  applySnapshot,
  arrayActions,
  getSnapshot,
  model,
  Model,
  modelAction,
  prop,
} from "mobx-keystone";
import { FileImport } from ".";
import { dayjs, DayJsInput } from "utils";

@model("mediaViewer/ImportBatch")
export class ImportBatch extends Model({
  createdAt: prop<string>(),
  completedAt: prop<string>(null),
  id: prop<string>(),
  imports: prop<FileImport[]>(() => []),
  startedAt: prop<string>(null),
  tagIds: prop<string[]>(),
}) {
  @modelAction
  addImport(fileImport: FileImport) {
    this.imports.push(new FileImport(fileImport));
  }

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
    arrayActions.set(this.imports, index, { ...this.imports[index], ...updates });
  }

  getByPath(filePath: string) {
    return this.imports.find((imp) => imp.path === filePath);
  }

  @computed
  get completed() {
    return this.imports.filter((imp) => ["COMPLETE", "DUPLICATE"].includes(imp.status));
  }

  @computed
  get imported() {
    return this.imports.filter((imp) => imp.status !== "PENDING");
  }

  @computed
  get nextImport() {
    return this.imports.find((imp) => imp.status === "PENDING");
  }

  @computed
  get status() {
    return this.imports.some((imp) => imp.status === "PENDING")
      ? "PENDING"
      : this.imports.some((imp) => imp.status === "ERROR")
      ? "ERROR"
      : this.imports.some((imp) => imp.status === "DUPLICATE")
      ? "DUPLICATE"
      : "COMPLETE";
  }
}
