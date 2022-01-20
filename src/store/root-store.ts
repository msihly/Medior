import { applySnapshot, types, Instance } from "mobx-state-tree";
import { AppStoreModel, defaultAppStore } from "./app";
import { FileStoreModel, defaultFileStore } from "./files";

export const RootStoreModel = types
  .model("RootStore")
  .props({
    appStore: types.optional(AppStoreModel, defaultAppStore),
    fileStore: types.optional(FileStoreModel, defaultFileStore),
  })
  .actions((self) => ({
    reset: () => {
      applySnapshot(self, {
        appStore: defaultAppStore,
        fileStore: defaultFileStore,
      });
    },
  }));

export interface RootStore extends Instance<typeof RootStoreModel> {}
