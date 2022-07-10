import { applySnapshot, Instance, SnapshotOut, types } from "mobx-state-tree";

export const FileImportModel = types
  .model("File")
  .props({
    dateCreated: types.string,
    extension: types.string,
    path: types.string,
    name: types.string,
    size: types.number,
    status: types.enumeration(["COMPLETE", "DUPLICATE", "ERROR", "PENDING"]),
  })
  .actions((self) => ({
    update: (props: Partial<typeof self>) => {
      applySnapshot(self, { ...self, ...props });
    },
  }));

export interface FileImportInstance extends Instance<typeof FileImportModel> {}
export interface FileImportSnapshot extends SnapshotOut<typeof FileImportModel> {}
