import { applySnapshot, getParentOfType, Instance, types } from "mobx-state-tree";
import { RootStoreModel } from "store/root-store";

export const TagModel = types
  .model("Tag")
  .props({
    id: types.string,
    aliasIds: types.array(types.string),
    label: types.string,
    parentIds: types.array(types.string),
  })
  .views((self) => ({
    get parentTags() {
      const rootStore = getParentOfType(self, RootStoreModel) as Instance<typeof RootStoreModel>;
      return self.parentIds.map((id) => rootStore.tagStore.getById(id));
    },
  }))
  .actions((self) => ({
    update: (tag) => {
      applySnapshot(self, { ...self, ...tag });
    },
  }));

type TagType = Instance<typeof TagModel>;
export interface Tag extends TagType {}
