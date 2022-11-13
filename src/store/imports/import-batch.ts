import { applySnapshot, getSnapshot, model, Model, modelAction, prop } from "mobx-keystone";
import { FileImport } from ".";
import { dayjs, DayJsInput } from "utils";
import { computed } from "mobx";

@model("mediaViewer/ImportBatch")
export class ImportBatch extends Model({
  addedAt: prop<string>(),
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

  @computed
  get completed() {
    return this.imports.filter((imp) => imp.status === "COMPLETE");
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
