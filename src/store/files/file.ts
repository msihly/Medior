import { applySnapshot, cast, getParentOfType, Instance, types } from "mobx-state-tree";
import { RootStoreModel } from "store/root-store";
import { FileCollection, FileCollectionStore } from "store/collections";
import { Tag, TagStore } from "store/tags";
import { dayjs } from "utils";

export const FileModel = types
  .model("File")
  .props({
    dateCreated: types.string,
    dateModified: types.string,
    duration: types.maybeNull(types.number),
    ext: types.string,
    hash: types.string,
    height: types.number,
    id: types.string,
    isArchived: types.boolean,
    isSelected: types.boolean,
    originalName: types.maybeNull(types.string),
    originalPath: types.string,
    path: types.string,
    rating: types.number,
    size: types.number,
    tagIds: types.array(types.string),
    thumbPaths: types.array(types.string),
    width: types.number,
  })
  .views((self) => ({
    get collections(): FileCollection[] {
      const rootStore = getParentOfType(self, RootStoreModel);
      const fileCollectionStore: FileCollectionStore = rootStore.fileCollectionStore;
      return fileCollectionStore.listByFileId(self.id);
    },
    get tags(): Tag[] {
      const rootStore = getParentOfType(self, RootStoreModel);
      const tagStore: TagStore = rootStore.tagStore;
      return self.tagIds.map((id) => tagStore.getById(id));
    },
  }))
  .actions((self) => ({
    update: (updates: Partial<typeof self>) => {
      applySnapshot(self, { ...self, ...updates });
    },
    updateTags: (tagIds: string[], dateModified = dayjs().toISOString()) => {
      self.tagIds = cast(tagIds);
      self.dateModified = dateModified;
    },
  }));

export interface File extends Instance<typeof FileModel> {}
