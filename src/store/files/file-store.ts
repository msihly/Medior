import {
  applySnapshot,
  cast,
  Instance,
  SnapshotOrInstance,
  SnapshotOut,
  types,
} from "mobx-state-tree";
import { File, FileModel, IMAGE_EXT_REG_EXP, IMAGE_TYPES, VIDEO_EXT_REG_EXP, VIDEO_TYPES } from ".";
import { toast } from "react-toastify";

const TagOptionModel = types.model({
  aliases: types.array(types.string),
  count: types.number,
  id: types.string,
  label: types.maybeNull(types.string),
  parentLabels: types.maybeNull(types.array(types.string)),
});
export type TagOption = Instance<typeof TagOptionModel>;
export type TagOptionSnapshot = SnapshotOut<typeof TagOptionModel>;

export const defaultFileStore = {
  files: [],
};

export const FileStoreModel = types
  .model("FileStore")
  .props({
    files: types.array(FileModel),
  })
  .views((self) => ({
    get archived(): File[] {
      return self.files.filter((f) => f.isArchived);
    },
    get images(): File[] {
      return self.files.filter((f) => IMAGE_EXT_REG_EXP.test(f.ext));
    },
    get selected(): File[] {
      return self.files.filter((f) => f.isSelected);
    },
    get videos(): File[] {
      return self.files.filter((f) => VIDEO_EXT_REG_EXP.test(f.ext));
    },
    getById: (id: string): File => {
      return self.files.find((f) => f.id === id);
    },
    listByHash: (hash: string): File[] => {
      return self.files.filter((f) => f.hash === hash);
    },
    listByTagId: (tagId: string): File[] => {
      return self.files.filter((f) => f.tagIds.includes(tagId));
    },
  }))
  .actions((self) => ({
    addFiles: (...files: File[]) => {
      self.files = cast(self.files.concat(files.map((f) => ({ ...f, isSelected: false }))));
    },
    archiveFiles: (fileIds: string[], isUnarchive = false) => {
      if (!fileIds?.length) return false;
      self.files.forEach((f) => {
        if (fileIds.includes(f.id)) f.isArchived = !isUnarchive;
      });
      toast.warning(`${isUnarchive ? "Unarchived" : "Archived"} ${fileIds.length} files`);
    },
    deleteFiles: (fileIds: string[]) => {
      if (!fileIds?.length) return false;
      self.files = cast(self.files.filter((f) => !fileIds.includes(f.id)));
      toast.error(`Deleted ${fileIds.length} files`);
    },
    overwrite: (files: SnapshotOrInstance<File>[]) => {
      self.files = cast(files.map((f) => ({ ...f, isSelected: false })));
    },
    reset: () => {
      applySnapshot(self, defaultFileStore);
    },
    toggleFilesSelected: (fileIds: string[], selected: boolean = null) => {
      self.files.forEach((f) => {
        if (fileIds.includes(f.id)) f.isSelected = selected ?? !f.isSelected;
      });
    },
  }));

export interface FileStore extends Instance<typeof FileStoreModel> {}
