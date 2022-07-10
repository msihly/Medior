import { applySnapshot, types, Instance } from "mobx-state-tree";
import { AppStoreModel, defaultAppStore } from "./app";
import { FileStoreModel, defaultFileStore } from "./files";
import { ImportStoreModel, defaultImportStore } from "./imports";
import { TagStoreModel, defaultTagStore } from "./tags";

export const RootStoreModel = types
  .model("RootStore")
  .props({
    appStore: types.optional(AppStoreModel, defaultAppStore),
    fileStore: types.optional(FileStoreModel, defaultFileStore),
    importStore: types.optional(ImportStoreModel, defaultImportStore),
    tagStore: types.optional(TagStoreModel, defaultTagStore),
  })
  .actions((self) => ({
    reset: () => {
      applySnapshot(self, {
        appStore: defaultAppStore,
        fileStore: defaultFileStore,
        importStore: defaultImportStore,
        tagStore: defaultTagStore,
      });
    },
  }));

export interface RootStore extends Instance<typeof RootStoreModel> {}
