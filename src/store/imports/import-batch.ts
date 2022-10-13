import { cast, Instance, types } from "mobx-state-tree";
import { FileImportInstance, FileImportModel } from ".";
import { dayjs, DayJsInput } from "utils";
import { ImportStatus } from "components";

export const ImportBatchModel = types
  .model({
    addedAt: types.string,
    completedAt: types.maybeNull(types.string),
    id: types.string,
    imports: types.array(FileImportModel),
    startedAt: types.maybeNull(types.string),
    tagIds: types.array(types.string),
  })
  .views((self) => ({
    get completed(): FileImportInstance[] {
      return self.imports.filter((imp) => imp.status === "COMPLETE");
    },
    get imported(): FileImportInstance[] {
      return self.imports.filter((imp) => imp.status !== "PENDING");
    },
    get nextImport(): FileImportInstance {
      return self.imports.find((imp) => imp.status === "PENDING");
    },
    get status(): ImportStatus {
      return self.imports.some((imp) => imp.status === "PENDING")
        ? "PENDING"
        : self.imports.some((imp) => imp.status === "ERROR")
        ? "ERROR"
        : self.imports.some((imp) => imp.status === "DUPLICATE")
        ? "DUPLICATE"
        : "COMPLETE";
    },
  }))
  .actions((self) => ({
    setCompletedAt: (completedAt: DayJsInput) => {
      self.completedAt = dayjs(completedAt).toISOString();
    },
    setStartedAt: (startedAt: DayJsInput) => {
      self.startedAt = dayjs(startedAt).toISOString();
    },
    setTagIds: (tagIds: string[]) => {
      self.tagIds = cast(tagIds);
    },
  }));

export interface ImportBatch extends Instance<typeof ImportBatchModel> {}
