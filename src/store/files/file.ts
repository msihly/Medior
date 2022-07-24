import { applySnapshot, cast, getParentOfType, Instance, types } from "mobx-state-tree";
import { RootStoreModel } from "store/root-store";
import { Tag, TagStore } from "store/tags";
import { dayjs } from "utils";

export const FileModel = types
  .model("File")
  .props({
    id: types.string,
    dateCreated: types.string,
    dateModified: types.string,
    duration: types.maybeNull(types.number),
    ext: types.string,
    hash: types.string,
    isArchived: types.boolean,
    isSelected: types.boolean,
    originalName: types.maybeNull(types.string),
    originalPath: types.string,
    rating: types.number,
    path: types.string,
    size: types.number,
    tagIds: types.array(types.string),
    thumbPaths: types.array(types.string),
  })
  .views((self) => ({
    get tags(): Tag[] {
      const rootStore = getParentOfType(self, RootStoreModel);
      const tagStore: TagStore = rootStore.tagStore;
      return self.tagIds.map((id) => tagStore.getById(id));
    },
  }))
  .actions((self) => ({
    update: (updates: Partial<File>) => {
      applySnapshot(self, { ...self, ...updates });
    },
    updateTags: (tagIds: string[], dateModified = dayjs().toISOString()) => {
      self.tagIds = cast(tagIds);
      self.dateModified = dateModified;
    },
  }));

export interface File extends Instance<typeof FileModel> {}
