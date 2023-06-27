import { ImportStatus } from "components";
import { FileImport, RootStore, SelectedImageTypes, SelectedVideoTypes } from "store";

/* ------------------------------ FILE IMPORTS ------------------------------ */
export type AddTagsToBatchInput = { batchId: string; tagIds: string[] };

export type CompleteImportBatchInput = { id: string };

export type CreateImportBatchInput = {
  createdAt: string;
  imports: FileImport[];
  tagIds?: string[];
};

export type DeleteImportBatchInput = { id: string };

export type RemoveTagFromAllBatchesInput = { tagId: string };

export type RemoveTagsFromBatchInput = { batchId: string; tagIds: string[] };

export type StartImportBatchInput = { id: string };

export type UpdateFileImportByPathInput = {
  batchId: string;
  errorMsg?: string;
  filePath?: string;
  fileId: string;
  status?: ImportStatus;
};

/* ---------------------------------- FILES --------------------------------- */
export type AddTagsToFilesInput = { fileIds: string[]; tagIds: string[] };

export type DeleteFilesInput = { fileIds: string[] };

export type EditFileTagsInput = {
  addedTagIds?: string[];
  batchId?: string;
  fileIds: string[];
  removedTagIds?: string[];
  rootStore: RootStore;
};

export type GetFileByHashInput = { hash: string };

export type ImportFileInput = {
  dateCreated: string;
  duration: number;
  ext: string;
  frameRate: number;
  hash: string;
  height: number;
  originalName: string;
  originalPath: string;
  path: string;
  size: number;
  tagIds: string[];
  thumbPaths: string[];
  width: number;
};

export type ListFilesInput = { ids?: string[] };

export type ListFilesByTagIdsInput = { tagIds: string[] };

export type ListFilteredFilesInput = {
  includeTagged: boolean;
  includeUntagged: boolean;
  isArchived: boolean;
  selectedImageTypes: SelectedImageTypes;
  selectedVideoTypes: SelectedVideoTypes;
};

export type RefreshFileInput = { id: string; withThumbs?: boolean };

export type RemoveTagFromAllFilesInput = { tagId: string };

export type RemoveTagsFromFilesInput = { fileIds: string[]; tagIds: string[] };

export type SetFileIsArchivedInput = { fileIds: string[]; isArchived: boolean };

export type SetFileRatingInput = { fileIds: string[]; rating: number };

export type UpdateFileInput = Partial<File> & { id: string };

/* ---------------------------------- TAGS ---------------------------------- */
export type AddChildTagIdsToTagsInput = { childTagIds: string[]; tagIds: string[] };

export type AddParentTagIdsToTagsInput = { parentTagIds: string[]; tagIds: string[] };

export type CreateTagInput = {
  aliases?: string[];
  childIds?: string[];
  label: string;
  parentIds?: string[];
};

export type DeleteTagInput = { id: string };

export type EditTagInput = {
  aliases?: string[];
  childIds?: string[];
  id: string;
  label?: string;
  parentIds?: string[];
};

export type RemoveChildTagIdsFromTagsInput = { childTagIds: string[]; tagIds: string[] };

export type RemoveParentTagIdsFromTagsInput = { parentTagIds: string[]; tagIds: string[] };

export type RemoveTagFromAllChildTagsInput = { tagId: string };

export type RemoveTagFromAllParentTagsInput = { tagId: string };

export type SetTagCountInput = { count: number; id: string };
