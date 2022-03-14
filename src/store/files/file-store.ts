import { applySnapshot, cast, getParentOfType, Instance, types } from "mobx-state-tree";
import { RootStoreModel } from "store/root-store";
import { File, FileModel } from ".";
import { countItems, sortArray } from "utils";
import { toast } from "react-toastify";

const NUMERICAL_ATTRIBUTES = ["size"];

const FileImportModel = types.model({
  isCompleted: types.boolean,
  path: types.string,
  name: types.string,
  extension: types.string,
  size: types.number,
});
export type FileImport = Instance<typeof FileImportModel>;

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
  id: types.string,
  count: types.number,
});
export type TagCount = Instance<typeof TagCountModel>;

const TagOptionModel = types.model({
  count: types.number,
  id: types.string,
  label: types.maybe(types.string),
});
export type TagOption = Instance<typeof TagOptionModel>;

export const defaultFileStore = {
  duplicates: [],
  excludeDescendants: false,
  excludedTags: [],
  files: [],
  imports: [],
  includeDescendants: false,
  includedTags: [],
  includeTagged: true,
  includeUntagged: true,
  isArchiveOpen: false,
  isImporting: false,
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
    excludeDescendants: types.boolean,
    excludedTags: types.array(TagOptionModel),
    files: types.array(FileModel),
    imports: types.array(FileImportModel),
    includeDescendants: types.boolean,
    includedTags: types.array(TagOptionModel),
    includeTagged: types.boolean,
    includeUntagged: types.boolean,
    isArchiveOpen: types.boolean,
    isImporting: types.boolean,
    selectedImageTypes: ImageTypesModel,
    selectedVideoTypes: VideoTypesModel,
    sortDir: types.string,
    sortKey: types.string,
  })
  .views((self) => ({
    get archived() {
      return self.files.filter((f) => f.isArchived);
    },
    get completedImports() {
      return self.imports.filter((imp) => imp.isCompleted);
    },
    get filtered() {
      const rootStore = getParentOfType(self, RootStoreModel) as Instance<typeof RootStoreModel>;
      // return self.tagIds.map((id) => rootStore.tagStore.getById(id));

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
            ? [
                ...new Set(
                  f.tagIds.flatMap((tagId) => rootStore.tagStore.getById(tagId)?.parentIds)
                ),
              ]
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
    get images() {
      const imageTypes = [".jpg", ".jpeg", ".png"];
      return self.files.filter((f) => imageTypes.includes(f.ext));
    },
    get selected() {
      return self.files.filter((f) => f.isSelected);
    },
    get videos() {
      const videoTypes = [".gif", ".webm", ".mp4", ".mkv"];
      return self.files.filter((f) => videoTypes.includes(f.ext));
    },
    getById: (id: string) => {
      return self.files.find((f) => f.id === id);
    },
    getTagCounts: (files: File[] = self.files) => {
      const counts = countItems(files.flatMap((f) => f.tagIds).filter((t) => t !== undefined)).map(
        ({ value, count }) => ({ count, id: value })
      );

      return sortArray(counts, "count", true, true);
    },
  }))
  .views((self) => ({
    get hasIncompleteImports() {
      return self.imports.length > self.completedImports.length;
    },
    get selectedTagCounts() {
      return self.getTagCounts(self.selected);
    },
    getTagCountById: (id: string) => {
      return self.getTagCounts().find((t) => t.id === id)?.count;
    },
  }))
  .actions((self) => ({
    addDuplicates: (files: File[]) => {
      self.duplicates.push(...files.map((f) => ({ ...f, isArchived: false, isSelected: false })));
    },
    addFiles: (files: File[]) => {
      self.files = cast(self.files.concat(files.map((f) => ({ ...f, isSelected: false }))));
    },
    addImports: (...fileImports: FileImport[]) => {
      fileImports.forEach((fileImport) => {
        if (!self.imports.find((imp) => imp.path === fileImport.path))
          self.imports.push(fileImport);
      });
    },
    archiveFiles: (fileIds: string[], isUnarchive = false) => {
      if (!fileIds?.length) return false;
      self.files.forEach((f) => {
        if (fileIds.includes(f.id)) f.isArchived = !isUnarchive;
      });
      toast.warning(`${isUnarchive ? "Unarchived" : "Archived"} ${fileIds.length} files`);
    },
    completeImport: (filePath: string) => {
      const fileImport = self.imports.find((f) => f.path === filePath);
      fileImport.isCompleted = true;
      self.isImporting = false;
    },
    deleteFiles: (fileIds: string[]) => {
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
    setIsImporting: (isImporting: boolean) => {
      self.isImporting = isImporting;
    },
    setSelectedImageTypes: (updates: ImageTypes) => {
      self.selectedImageTypes = { ...self.selectedImageTypes, ...updates };
    },
    setSelectedVideoTypes: (updates: VideoTypes) => {
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

export interface FileStore extends Instance<typeof FileStoreModel> {}
