import { getParentOfType, Instance, types } from "mobx-state-tree";
import { RootStoreModel } from "store/root-store";
import dayjs from "dayjs";

export const FileModel = types
  .model("File")
  .props({
    id: types.string,
    dateCreated: types.string,
    dateModified: types.string,
    ext: types.string,
    hash: types.string,
    isArchived: types.boolean,
    isSelected: types.boolean,
    originalName: types.maybeNull(types.string),
    originalPath: types.string,
    path: types.string,
    size: types.number,
    tagIds: types.array(types.string),
    thumbPaths: types.array(types.string),
  })
  .views((self) => ({
    get tags() {
      const rootStore = getParentOfType(self, RootStoreModel) as Instance<typeof RootStoreModel>;
      return self.tagIds.map((id) => rootStore.tagStore.getById(id));
    },
  }))
  .actions((self) => ({
    updateTags: (tagIds, dateModified = dayjs().toISOString()) => {
      self.tagIds = tagIds;
      self.dateModified = dateModified;
    },
  }));

export interface File extends Instance<typeof FileModel> {}
