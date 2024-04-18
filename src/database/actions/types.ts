import { File, FileCollection, RegExMap } from "database";
import { FileImport, SelectedImageTypes, SelectedVideoTypes } from "store";
import { ModelCreationData } from "mobx-keystone";
import { ImportStatus } from "components";
import { LogicalOp } from "utils";

/* --------------------------- DATABASE / SERVERS --------------------------- */
export type StartServersInput = {
  emitReloadEvents?: boolean;
  withDatabase?: boolean;
  withServer?: boolean;
  withSocket?: boolean;
};

/* -------------------------------- COLLECTIONS ------------------------------- */
export type CreateCollectionFilterPipelineInput = {
  excludedDescTagIds: string[];
  excludedTagIds: string[];
  isSortDesc: boolean;
  optionalTagIds: string[];
  requiredDescTagIds: string[];
  requiredTagIds: string[];
  sortKey: string;
  title: string;
};

export type CreateCollectionInput = {
  fileIdIndexes: { fileId: string; index: number }[];
  title: string;
  withSub?: boolean;
};

export type DeleteCollectionInput = { id: string };

export type ListCollectionIdsByTagIdsInput = { tagIds: string[] };

export type ListFilteredCollectionsInput = CreateCollectionFilterPipelineInput & {
  page: number;
  pageSize: number;
};

export type UpdateCollectionInput = Partial<FileCollection> & { id: string };

/* ------------------------------ FILE IMPORTS ------------------------------ */
export type AddTagsToBatchInput = { batchId: string; tagIds: string[] };

export type CompleteImportBatchInput = {
  collectionId?: string;
  fileIds: string[];
  id: string;
  tagIds: string[];
};

export type CreateImportBatchesInput = {
  collectionTitle?: string;
  createdAt: string;
  deleteOnImport: boolean;
  ignorePrevDeleted: boolean;
  imports: ModelCreationData<FileImport>[];
  rootFolderPath: string;
  tagIds?: string[];
}[];

export type DeleteImportBatchesInput = { ids: string[] };

export type RemoveTagsFromBatchInput = { batchId: string; tagIds: string[] };

export type StartImportBatchInput = { id: string };

export type UpdateFileImportByPathInput = {
  batchId: string;
  errorMsg?: string;
  fileId: string;
  filePath?: string;
  status?: ImportStatus;
  thumbPaths?: string[];
};

/* ---------------------------------- FILES --------------------------------- */
export type AddTagsToFilesInput = { fileIds: string[]; tagIds: string[] };

export type ArchiveFilesInput = { fileIds: string[] };

export type CreateFileFilterPipelineInput = {
  dateCreatedEnd?: string;
  dateCreatedStart?: string;
  dateModifiedEnd?: string;
  dateModifiedStart?: string;
  excludedDescTagIds: string[];
  excludedFileIds?: string[];
  excludedTagIds: string[];
  hasDiffParams: boolean;
  isArchived: boolean;
  isSortDesc: boolean;
  numOfTagsOp: LogicalOp | "";
  numOfTagsValue?: number;
  optionalTagIds: string[];
  requiredDescTagIds: string[];
  requiredTagIds: string[];
  selectedImageTypes: SelectedImageTypes;
  selectedVideoTypes: SelectedVideoTypes;
  sortKey: string;
};

export type DeleteFilesInput = { fileIds: string[] };

export type EditFileTagsInput = {
  addedTagIds?: string[];
  batchId?: string;
  fileIds: string[];
  removedTagIds?: string[];
  withSub?: boolean;
};

export type GetDeletedFileInput = { hash: string };

export type GetFileByHashInput = { hash: string };

export type GetShiftSelectedFilesInput = CreateFileFilterPipelineInput & {
  clickedId: string;
  clickedIndex: number;
  selectedIds: string[];
};

export type ImportFileInput = {
  dateCreated: string;
  diffusionParams: string;
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
  tagIdsWithAncestors: string[];
  thumbPaths: string[];
  width: number;
};

export type IncludedAllTagItem = string | string[];

export type ListFaceModelsInput = { ids?: string[] };

export type ListFileIdsByTagIdsInput = { tagIds: string[] };

export type ListFileIdsForCarouselInput = ListFilteredFilesInput;

export type ListFilesInput = {
  ids?: string[];
  withFaceModels?: boolean;
  withHasFaceModels?: boolean;
};

export type ListFilesByTagIdsInput = { tagIds: string[] };

export type ListFilteredFilesInput = CreateFileFilterPipelineInput & {
  page: number;
  pageSize: number;
};

export type LoadFaceModelsInput = { fileIds?: string[]; withOverwrite?: boolean };

export type LoadFilesInput = { fileIds?: string[]; withOverwrite?: boolean };

export type RefreshFileInput = { curFile?: File; id: string };

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
export type CreateTagInput = {
  aliases?: string[];
  childIds?: string[];
  label: string;
  parentIds?: string[];
  regExMap?: RegExMap;
  withSub?: boolean;
};

export type DeleteTagInput = { id: string };

export type DetectFacesInput = { imagePath: string };

export type EditTagInput = Partial<CreateTagInput> & { id: string };

export type MergeTagsInput = Omit<Required<CreateTagInput>, "withSub"> & {
  tagIdToKeep: string;
  tagIdToMerge: string;
};

export type RecalculateTagCountsInput = { tagIds: string[]; withSub?: boolean };

export type RefreshTagRelationsInput = {
  tagId: string;
  withSub?: boolean;
};

export type RegenCollAttrsInput = { collIds?: string[]; fileIds?: string[] };

export type RemoveChildTagIdsFromTagsInput = { childTagIds: string[]; tagIds: string[] };

export type RemoveParentTagIdsFromTagsInput = { parentTagIds: string[]; tagIds: string[] };

export type SetTagCountInput = { count: number; id: string };

export type UpsertTagInput = { label: string; parentLabels?: string[] };
