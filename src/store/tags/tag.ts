import { applySnapshot, getParentOfType, Instance, SnapshotOut, types } from "mobx-state-tree";
import { RootStoreModel } from "store/root-store";
import { TagOptionSnapshot } from "store/files";
import { TagStore } from "./tag-store";

export const TagModel = types
  .model("Tag")
  .props({
    id: types.string,
    aliases: types.array(types.string),
    label: types.string,
    parentIds: types.array(types.string),
  })
  .views((self) => ({
    get parentTags(): Tag[] {
      const rootStore = getParentOfType(self, RootStoreModel);
      const tagStore: TagStore = rootStore.tagStore;
      return self.parentIds.map((id) => tagStore.getById(id));
    },
    get count(): number {
      const rootStore = getParentOfType(self, RootStoreModel);
      const tagStore: TagStore = rootStore.tagStore;
      return tagStore.getTagCountById(self.id);
    },
  }))
  .views((self) => ({
    get parentTagOptions(): TagOptionSnapshot[] {
      return self.parentTags.map((t) => t.tagOption);
    },
    get tagOption(): TagOptionSnapshot {
      return {
        count: self.count,
        id: self.id,
        label: self.label,
        parentLabels: self.parentTags.map((t) => t.label),
      };
    },
  }))
  .actions((self) => ({
    update: (tag) => {
      applySnapshot(self, { ...self, ...tag });
    },
  }));

export interface Tag extends Instance<typeof TagModel> {}
export interface TagSnapshot extends SnapshotOut<typeof TagModel> {}
