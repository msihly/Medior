import { applySnapshot, types, Instance } from "mobx-state-tree";
import { AppStoreModel, defaultAppStore } from "./app";
import { FileStoreModel, defaultFileStore } from "./files";
import { TagStoreModel, defaultTagStore } from "./tags";

export const RootStoreModel = types
  .model("RootStore")
  .props({
    appStore: types.optional(AppStoreModel, defaultAppStore),
    fileStore: types.optional(FileStoreModel, defaultFileStore),
    tagStore: types.optional(TagStoreModel, defaultTagStore),
  })
  .actions((self) => ({
    reset: () => {
      applySnapshot(self, {
        appStore: defaultAppStore,
        fileStore: defaultFileStore,
        tagStore: defaultTagStore,
      });
    },
  }));

export interface RootStore extends Instance<typeof RootStoreModel> {}
