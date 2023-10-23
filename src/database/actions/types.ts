import { File, Tag } from "database";
import { FileImport, RootStore, SelectedImageTypes, SelectedVideoTypes } from "store";
import { ImportStatus } from "components";

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

export type ArchiveFilesInput = { fileIds: string[] };

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

export type ListFaceModelsInput = { ids?: string[] };

export type ListFilesInput = { ids?: string[] };

export type ListFilesByTagIdsInput = { tagIds: string[] };

export type listFilteredFileIdsInput = {
  excludedAnyTagIds: string[];
  includedAllTagIds: string[];
  includedAnyTagIds: string[];
  isSortDesc: boolean;
  includeTagged: boolean;
  includeUntagged: boolean;
  isArchived: boolean;
  selectedImageTypes: SelectedImageTypes;
  selectedVideoTypes: SelectedVideoTypes;
  sortKey: string;
};

export type LoadFilesInput = { fileIds?: string[]; withOverwrite?: boolean };

export type OnFilesArchivedInput = { fileIds: string[] };

export type OnFilesDeletedInput = { fileIds: string[] };

export type OnFilesUpdatedInput = { fileIds: string[]; updates: Partial<File> };

export type OnFileTagsUpdatedInput = {
  addedTagIds: string[];
  batchId?: string;
  fileIds?: string[];
  removedTagIds: string[];
};

export type RefreshFileInput = { curFile?: File; id?: string; withThumbs?: boolean };

export type RefreshSelectedFilesInput = { withThumbs?: boolean };

export type RemoveTagFromAllFilesInput = { tagId: string };

export type RemoveTagsFromFilesInput = { fileIds: string[]; tagIds: string[] };

export type SetFileFaceModelsInput = {
  faceModels: {
    box: { height: number; width: number; x: number; y: number };
    /** JSON representation of Float32Array[] */
    descriptors: string;
    fileId: string;
    tagId: string;
  }[];
  id: string;
};

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
  withSub?: boolean;
};

export type DeleteTagInput = { id: string };

export type DetectFacesInput = { imagePath: string };

export type EditTagInput = {
  aliases?: string[];
  childIds?: string[];
  id: string;
  label?: string;
  parentIds?: string[];
};

export type OnTagCreatedInput = { tag?: Tag };

export type OnTagDeletedInput = { tagId: string };

export type OnTagUpdatedInput = { tagId: string; updates: Partial<Tag> };

export type RecalculateTagCountsInput = { tagIds: string[] };

export type RemoveChildTagIdsFromTagsInput = { childTagIds: string[]; tagIds: string[] };

export type RemoveParentTagIdsFromTagsInput = { parentTagIds: string[]; tagIds: string[] };

export type RemoveTagFromAllChildTagsInput = { tagId: string };

export type RemoveTagFromAllParentTagsInput = { tagId: string };

export type SetTagCountInput = { count: number; id: string };
