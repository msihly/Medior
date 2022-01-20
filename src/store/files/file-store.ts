import { applySnapshot, cast, Instance, types } from "mobx-state-tree";
import { File, FileModel } from ".";
import { countItems, sortArray } from "utils";
import { toast } from "react-toastify";

const NUMERICAL_ATTRIBUTES = ["size"];

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

const TagCountModel = types.model({
  label: types.string,
  count: types.number,
});
export type TagCount = Instance<typeof TagCountModel>;

export const defaultFileStore = {
  duplicates: [],
  excludedTags: [],
  files: [],
  includedTags: [],
  includeTagged: true,
  includeUntagged: true,
  isArchiveOpen: false,
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
    duplicates: types.array(FileModel),
    excludedTags: types.array(TagCountModel),
    files: types.array(FileModel),
    includedTags: types.array(TagCountModel),
    includeTagged: types.boolean,
    includeUntagged: types.boolean,
    isArchiveOpen: types.boolean,
    selectedImageTypes: ImageTypesModel,
    selectedVideoTypes: VideoTypesModel,
    sortDir: types.string,
    sortKey: types.string,
  })
  .views((self) => ({
    get archived() {
      return self.files.filter((f) => f.isArchived);
    },
    get filtered() {
      const includedTags = self.includedTags.map((t) => t.label);
      const excludedTags = self.excludedTags.map((t) => t.label);

      const unarchived = self.files.filter((f) => self.isArchiveOpen === f.isArchived);

      const filtered = unarchived.filter((f) => {
        const hasTags = f.tags?.length > 0;
        if (!self.includeTagged || !self.includeUntagged) {
          if (self.includeTagged && !hasTags) return false;
          if (self.includeUntagged && hasTags) return false;
        }

        const hasIncluded = includedTags.every((t) => f.tags.includes(t));
        const hasExcluded = excludedTags.some((t) => f.tags.includes(t));
        const hasExt = !!Object.entries({
          ...self.selectedImageTypes,
          ...self.selectedVideoTypes,
        }).find(([key, value]) => key === f.ext.substring(1) && value);
        return hasIncluded && !hasExcluded && hasExt;
      });

      return sortArray(
        filtered,
        self.sortKey,
        self.sortDir === "desc",
        NUMERICAL_ATTRIBUTES.includes(self.sortKey)
      );
    },
    get selected() {
      return self.files.filter((f) => f.isSelected);
    },
    getById: (id) => {
      return self.files.find((f) => f.id === id);
    },
    getTagCounts: (files: File[] = self.files) => {
      const counts = countItems(files.flatMap((f) => f.tags).filter((t) => t !== undefined)).map(
        ({ value, count }) => ({ label: value, count })
      );

      return sortArray(counts, "count", true, true);
    },
  }))
  .views((self) => ({
    get selectedTagCounts() {
      return self.getTagCounts(self.selected);
    },
    getTagCount: (label) => {
      return self.getTagCounts().find((t) => t.label === label)?.count;
    },
  }))
  .actions((self) => ({
    addDuplicates: (files: File[]) => {
      self.duplicates.push(...files.map((f) => ({ ...f, isArchived: false, isSelected: false })));
    },
    addFiles: (files: File[]) => {
      self.files = cast(self.files.concat(files.map((f) => ({ ...f, isSelected: false }))));
    },
    archiveFiles: (fileIds, isUnarchive = false) => {
      if (!fileIds?.length) return false;
      self.files.forEach((f) => {
        if (fileIds.includes(f.id)) f.isArchived = !isUnarchive;
      });
      toast.warning(`${isUnarchive ? "Unarchived" : "Archived"} ${fileIds.length} files`);
    },
    deleteFiles: (fileIds) => {
      if (!fileIds?.length) return false;
      self.files = cast(self.files.filter((f) => !fileIds.includes(f.id)));
      toast.error(`Deleted ${fileIds.length} files`);
    },
    overwrite: (files: File[]) => {
      self.files = cast(files.map((f) => ({ ...f, isSelected: false })));
    },
    reset: () => {
      applySnapshot(self, defaultFileStore);
    },
    setExcludedTags: (tagCounts: TagCount[]) => {
      self.excludedTags = cast(tagCounts);
    },
    setIncludedTags: (tagCounts: TagCount[]) => {
      self.includedTags = cast(tagCounts);
    },
    setIncludeTagged: (isIncluded) => {
      self.includeTagged = isIncluded;
    },
    setIncludeUntagged: (isIncluded) => {
      self.includeUntagged = isIncluded;
    },
    setSelectedImageTypes: (updates) => {
      self.selectedImageTypes = { ...self.selectedImageTypes, ...updates };
    },
    setSelectedVideoTypes: (updates) => {
      self.selectedVideoTypes = { ...self.selectedVideoTypes, ...updates };
    },
    setSortDir: (dir) => {
      if (self.sortDir !== dir) {
        self.sortDir = dir;
        localStorage.setItem("sortDir", dir);
      }
    },
    setSortKey: (key) => {
      if (self.sortKey !== key) {
        self.sortKey = key;
        localStorage.setItem("sortKey", key);
      }
    },
    toggleArchiveOpen: (isOpen?: boolean) => {
      self.isArchiveOpen = isOpen ?? !self.isArchiveOpen;
    },
    toggleFilesSelected: (fileIds, selected = null) => {
      self.files.forEach((f) => {
        if (fileIds.includes(f.id)) f.isSelected = selected ?? !f.isSelected;
      });
    },
  }));

type FileStoreType = Instance<typeof FileStoreModel>;
export interface FileStore extends FileStoreType {}
