import { cast, Instance, SnapshotOrInstance, types } from "mobx-state-tree";
import { FileCollection, FileCollectionModel } from ".";

export const defaultFileCollectionStore = {
  activeCollectionId: null,
  activeFileId: null,
  collections: [],
  isCollectionManagerOpen: false,
  isCollectionEditorOpen: false,
};

export const FileCollectionStoreModel = types
  .model("FileCollectionStore")
  .props({
    activeCollectionId: types.maybeNull(types.string),
    activeFileId: types.maybeNull(types.string),
    collections: types.array(FileCollectionModel),
    isCollectionManagerOpen: types.boolean,
    isCollectionEditorOpen: types.boolean,
  })
  .views((self) => ({
    get activeCollection() {
      return self.collections.find((c) => c.id === self.activeCollectionId);
    },
    getById: (id: string): FileCollection => {
      return self.collections.find((c) => c.id === id);
    },
    listByFileId: (id: string): FileCollection[] => {
      return self.collections.filter((c) => c.fileIdIndexes.find((f) => f.fileId === id));
    },
  }))
  .actions((self) => ({
    overwrite: (collections: SnapshotOrInstance<FileCollection>[]) => {
      self.collections = cast(collections);
    },
    setActiveCollectionId: (id: string) => {
      self.activeCollectionId = id;
    },
    setActiveFileId: (id: string) => {
      self.activeFileId = id;
    },
    setIsCollectionEditorOpen: (isOpen: boolean) => {
      self.isCollectionEditorOpen = isOpen;
      if (isOpen) self.isCollectionManagerOpen = false;
    },
    setIsCollectionManagerOpen: (isOpen: boolean) => {
      self.isCollectionManagerOpen = isOpen;
      if (isOpen) self.isCollectionEditorOpen = false;
    },
  }));

export interface FileCollectionStore extends Instance<typeof FileCollectionStoreModel> {}
