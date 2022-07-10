import { TagOption } from "components";
import { applySnapshot, getParentOfType, Instance, types } from "mobx-state-tree";
import { RootStoreModel } from "store/root-store";
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
    get parentTagOptions(): TagOption[] {
      const rootStore = getParentOfType(self, RootStoreModel);
      const tagStore: TagStore = rootStore.tagStore;
      return self.parentIds.map((id) => tagStore.tagOptions.find((t) => t.id === id));
    },
  }))
  .actions((self) => ({
    update: (tag) => {
      applySnapshot(self, { ...self, ...tag });
    },
  }));

export interface Tag extends Instance<typeof TagModel> {}
