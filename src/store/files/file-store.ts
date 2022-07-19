import {
  applySnapshot,
  cast,
  getParentOfType,
  Instance,
  SnapshotOrInstance,
  SnapshotOut,
  types,
} from "mobx-state-tree";
import { RootStoreModel } from "store/root-store";
import { TagStoreModel } from "store/tags";
import { File, FileModel } from ".";
import { sortArray } from "utils";
import { toast } from "react-toastify";

const NUMERICAL_ATTRIBUTES = ["size"];
const ROW_COUNT = 40;

const ImageTypesModel = types.model({
  jpg: types.boolean,
  jpeg: types.boolean,
  png: types.boolean,
});
export type ImageTypes = Instance<typeof ImageTypesModel>;

const VideoTypesModel = types.model({
  gif: types.boolean,
  webm: types.boolean,
  mp4: types.boolean,
  mkv: types.boolean,
});
export type VideoTypes = Instance<typeof VideoTypesModel>;

const TagOptionModel = types.model({
  count: types.number,
  id: types.string,
  label: types.maybe(types.string),
  parentLabels: types.array(types.string),
});
export type TagOption = Instance<typeof TagOptionModel>;
export type TagOptionSnapshot = SnapshotOut<typeof TagOptionModel>;

export const defaultFileStore = {
  duplicates: [],
  excludeDescendants: false,
  excludedTags: [],
  files: [],
  imports: [],
  includeDescendants: false,
  includedTags: [],
  includeTagged: false,
  includeUntagged: false,
  isArchiveOpen: false,
  isImporting: false,
  page: 1,
  selectedImageTypes: {
    jpg: true,
    jpeg: true,
    png: true,
  },
  selectedVideoTypes: {
    gif: true,
    webm: true,
    mp4: true,
    mkv: true,
  },
  sortDir: "desc",
  sortKey: "dateCreated",
};

export const FileStoreModel = types
  .model("FileStore")
  .props({
    excludeDescendants: types.boolean,
    excludedTags: types.array(TagOptionModel),
    files: types.array(FileModel),
    includeDescendants: types.boolean,
    includedTags: types.array(TagOptionModel),
    includeTagged: types.boolean,
    includeUntagged: types.boolean,
    isArchiveOpen: types.boolean,
    page: types.number,
    selectedImageTypes: ImageTypesModel,
    selectedVideoTypes: VideoTypesModel,
    sortDir: types.string,
    sortKey: types.string,
  })
  .views((self) => ({
    get archived(): File[] {
      return self.files.filter((f) => f.isArchived);
    },
    get filtered(): File[] {
      const rootStore = getParentOfType(self, RootStoreModel);
      const tagStore: Instance<typeof TagStoreModel> = rootStore.tagStore;

      const excludedTagIds = self.excludedTags.map((t) => t.id);
      const includedTagIds = self.includedTags.map((t) => t.id);
      const unarchived = self.files.filter((f) => self.isArchiveOpen === f.isArchived);

      const filtered = unarchived.filter((f) => {
        const hasTags = f.tagIds?.length > 0;
        if (!self.includeTagged || !self.includeUntagged) {
          if (self.includeTagged && !hasTags) return false;
          if (self.includeUntagged && hasTags) return false;
        }

        const parentTagIds =
          self.excludeDescendants || self.includeDescendants
            ? [...new Set(f.tagIds.flatMap((tagId) => tagStore.getById(tagId)?.parentIds))]
            : [];

        const hasExcluded = excludedTagIds.some((tagId) => f.tagIds.includes(tagId));
        const hasExcludedParent =
          self.excludeDescendants &&
          parentTagIds.some((tagId: string) => excludedTagIds.includes(tagId));

        const hasIncluded = includedTagIds.every((tagId) => f.tagIds.includes(tagId));
        const hasIncludedParent =
          self.includeDescendants &&
          parentTagIds.some((tagId: string) => includedTagIds.includes(tagId));

        const hasExt = !!Object.entries({
          ...self.selectedImageTypes,
          ...self.selectedVideoTypes,
        }).find(([key, value]) => key === f.ext.substring(1) && value);

        return (hasIncluded || hasIncludedParent) && !hasExcluded && !hasExcludedParent && hasExt;
      });

      return sortArray(
        filtered,
        self.sortKey,
        self.sortDir === "desc",
        NUMERICAL_ATTRIBUTES.includes(self.sortKey)
      );
    },
    get images(): File[] {
      const imageTypes = [".jpg", ".jpeg", ".png"];
      return self.files.filter((f) => imageTypes.includes(f.ext));
    },
    get selected(): File[] {
      return self.files.filter((f) => f.isSelected);
    },
    get videos(): File[] {
      const videoTypes = [".gif", ".webm", ".mp4", ".mkv"];
      return self.files.filter((f) => videoTypes.includes(f.ext));
    },
    getById: (id: string): File => {
      return self.files.find((f) => f.id === id);
    },
    listByHash: (hash: string): File[] => {
      return self.files.filter((f) => f.hash === hash);
    },
  }))
  .views((self) => ({
    get displayed(): File[] {
      return self.filtered.slice((self.page - 1) * ROW_COUNT, self.page * ROW_COUNT);
    },
    get lastSelected(): File {
      return self.selected[self.selected.length - 1];
    },
    get pageCount(): number {
      return self.filtered.length < ROW_COUNT ? 1 : Math.ceil(self.filtered.length / ROW_COUNT);
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
    overwrite: (files: SnapshotOrInstance<typeof self.files>) => {
      self.files = cast(files.map((f) => ({ ...f, isSelected: false })));
    },
    reset: () => {
      applySnapshot(self, defaultFileStore);
    },
    setExcludeDescendants: (isExcluded: boolean) => {
      self.excludeDescendants = isExcluded;
    },
    setExcludedTags: (tagOptions: TagOption[]) => {
      self.excludedTags = cast(tagOptions);
    },
    setIncludeDescendants: (isIncluded: boolean) => {
      self.includeDescendants = isIncluded;
    },
    setIncludedTags: (tagOptions: TagOption[]) => {
      self.includedTags = cast(tagOptions);
    },
    setIncludeTagged: (isIncluded: boolean) => {
      self.includeTagged = isIncluded;
    },
    setIncludeUntagged: (isIncluded: boolean) => {
      self.includeUntagged = isIncluded;
    },
    setPage: (page: number) => {
      self.page = page;
    },
    setSelectedImageTypes: (updates: ImageTypes) => {
      self.selectedImageTypes = { ...self.selectedImageTypes, ...updates };
    },
    setSelectedVideoTypes: (updates: VideoTypes) => {
      self.selectedVideoTypes = { ...self.selectedVideoTypes, ...updates };
    },
    setSortDir: (dir: "asc" | "desc") => {
      if (self.sortDir !== dir) {
        self.sortDir = dir;
        localStorage.setItem("sortDir", dir);
      }
    },
    setSortKey: (key: string) => {
      if (self.sortKey !== key) {
        self.sortKey = key;
        localStorage.setItem("sortKey", key);
      }
    },
    toggleArchiveOpen: (isOpen?: boolean) => {
      self.isArchiveOpen = isOpen ?? !self.isArchiveOpen;
    },
    toggleFilesSelected: (fileIds: string[], selected: boolean = null) => {
      self.files.forEach((f) => {
        if (fileIds.includes(f.id)) f.isSelected = selected ?? !f.isSelected;
      });
    },
  }));

export interface FileStore extends Instance<typeof FileStoreModel> {}
