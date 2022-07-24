import { Instance, types } from "mobx-state-tree";
import { FileImportInstance, FileImportModel } from ".";
import { dayjs, DayJsInput } from "utils";

export const ImportBatchModel = types
  .model({
    addedAt: types.string,
    completedAt: types.maybeNull(types.string),
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
  }))
  .actions((self) => ({
    setCompletedAt: (completedAt: DayJsInput) => {
      self.completedAt = dayjs(completedAt).toISOString();
    },
    setStartedAt: (startedAt: DayJsInput) => {
      self.startedAt = dayjs(startedAt).toISOString();
    },
  }));

export interface ImportBatch extends Instance<typeof ImportBatchModel> {}
