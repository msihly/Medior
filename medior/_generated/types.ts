/* -------------------------------------------------------------------------- */
/*                    THIS IS A GENERATED FILE. DO NOT EDIT.                  */
/* -------------------------------------------------------------------------- */

import * as db from "medior/database";
import { QuerySelector, SortOrder } from "mongoose";

export type _FilterQuery<Schema> = {
  [SchemaKey in keyof Schema]?:
    | Schema[SchemaKey]
    | Array<Schema[SchemaKey]>
    | QuerySelector<Schema[SchemaKey]>;
} & {
  _id?: string | Array<string> | QuerySelector<string>;
  $and?: Array<_FilterQuery<Schema>>;
  $nor?: Array<_FilterQuery<Schema>>;
  $or?: Array<_FilterQuery<Schema>>;
  $text?: {
    $search: string;
    $language?: string;
    $caseSensitive?: boolean;
    $diacriticSensitive?: boolean;
  };
  $where?: string | Function;
  $comment?: string;
};

/* -------------------------------------------------------------------------- */
/*                                MODEL ACTIONS                               */
/* -------------------------------------------------------------------------- */
/* ------------------------------------ DeletedFile ----------------------------------- */
export type CreateDeletedFileInput = Omit<db.DeletedFileSchema, "id">;
export type DeleteDeletedFileInput = { id: string };
export type _ListDeletedFilesInput = {
  filter?: _FilterQuery<db.DeletedFileSchema>;
  page?: number;
  pageSize?: number;
  sort?: Record<string, SortOrder>;
  withOverwrite?: boolean;
};
export type UpdateDeletedFileInput = { id: string; updates: Partial<db.DeletedFileSchema> };

/* ------------------------------------ FileCollection ----------------------------------- */
export type CreateFileCollectionInput = Omit<db.FileCollectionSchema, "id">;
export type DeleteFileCollectionInput = { id: string };
export type ListFileCollectionsInput = {
  filter?: _FilterQuery<db.FileCollectionSchema>;
  page?: number;
  pageSize?: number;
  sort?: Record<string, SortOrder>;
  withOverwrite?: boolean;
};
export type UpdateFileCollectionInput = { id: string; updates: Partial<db.FileCollectionSchema> };

/* ------------------------------------ FileImportBatch ----------------------------------- */
export type CreateFileImportBatchInput = Omit<db.FileImportBatchSchema, "id">;
export type DeleteFileImportBatchInput = { id: string };
export type ListFileImportBatchsInput = {
  filter?: _FilterQuery<db.FileImportBatchSchema>;
  page?: number;
  pageSize?: number;
  sort?: Record<string, SortOrder>;
  withOverwrite?: boolean;
};
export type UpdateFileImportBatchInput = { id: string; updates: Partial<db.FileImportBatchSchema> };

/* ------------------------------------ File ----------------------------------- */
export type CreateFileInput = Omit<db.FileSchema, "id">;
export type DeleteFileInput = { id: string };
export type ListFilesInput = {
  filter?: _FilterQuery<db.FileSchema>;
  page?: number;
  pageSize?: number;
  sort?: Record<string, SortOrder>;
  withOverwrite?: boolean;
};
export type _UpdateFileInput = { id: string; updates: Partial<db.FileSchema> };

/* ------------------------------------ RegExMap ----------------------------------- */
export type CreateRegExMapInput = Omit<db.RegExMapSchema, "id">;
export type DeleteRegExMapInput = { id: string };
export type ListRegExMapsInput = {
  filter?: _FilterQuery<db.RegExMapSchema>;
  page?: number;
  pageSize?: number;
  sort?: Record<string, SortOrder>;
  withOverwrite?: boolean;
};
export type UpdateRegExMapInput = { id: string; updates: Partial<db.RegExMapSchema> };

/* ------------------------------------ Tag ----------------------------------- */
export type _CreateTagInput = Omit<db.TagSchema, "id">;
export type _DeleteTagInput = { id: string };
export type ListTagsInput = {
  filter?: _FilterQuery<db.TagSchema>;
  page?: number;
  pageSize?: number;
  sort?: Record<string, SortOrder>;
  withOverwrite?: boolean;
};
export type UpdateTagInput = { id: string; updates: Partial<db.TagSchema> };

/* -------------------------------------------------------------------------- */
/*                               CUSTOM ACTIONS                               */
/* -------------------------------------------------------------------------- */
export type AddFilesToCollectionInput = Parameters<typeof db.addFilesToCollection>[0];
export type AddFilesToCollectionOutput = ReturnType<typeof db.addFilesToCollection>;

export type CreateCollectionInput = Parameters<typeof db.createCollection>[0];
export type CreateCollectionOutput = ReturnType<typeof db.createCollection>;

export type DeduplicateCollectionsInput = Parameters<typeof db.deduplicateCollections>[0];
export type DeduplicateCollectionsOutput = ReturnType<typeof db.deduplicateCollections>;

export type DeleteCollectionsInput = Parameters<typeof db.deleteCollections>[0];
export type DeleteCollectionsOutput = ReturnType<typeof db.deleteCollections>;

export type DeleteEmptyCollectionsInput = Parameters<typeof db.deleteEmptyCollections>[0];
export type DeleteEmptyCollectionsOutput = ReturnType<typeof db.deleteEmptyCollections>;

export type ListAllCollectionIdsInput = Parameters<typeof db.listAllCollectionIds>[0];
export type ListAllCollectionIdsOutput = ReturnType<typeof db.listAllCollectionIds>;

export type ListCollectionIdsByTagIdsInput = Parameters<typeof db.listCollectionIdsByTagIds>[0];
export type ListCollectionIdsByTagIdsOutput = ReturnType<typeof db.listCollectionIdsByTagIds>;

export type RegenCollAttrsInput = Parameters<typeof db.regenCollAttrs>[0];
export type RegenCollAttrsOutput = ReturnType<typeof db.regenCollAttrs>;

export type RegenCollRatingInput = Parameters<typeof db.regenCollRating>[0];
export type RegenCollRatingOutput = ReturnType<typeof db.regenCollRating>;

export type RegenCollTagAncestorsInput = Parameters<typeof db.regenCollTagAncestors>[0];
export type RegenCollTagAncestorsOutput = ReturnType<typeof db.regenCollTagAncestors>;

export type UpdateCollectionInput = Parameters<typeof db.updateCollection>[0];
export type UpdateCollectionOutput = ReturnType<typeof db.updateCollection>;

export type CompleteImportBatchInput = Parameters<typeof db.completeImportBatch>[0];
export type CompleteImportBatchOutput = ReturnType<typeof db.completeImportBatch>;

export type CreateImportBatchesInput = Parameters<typeof db.createImportBatches>[0];
export type CreateImportBatchesOutput = ReturnType<typeof db.createImportBatches>;

export type DeleteImportBatchesInput = Parameters<typeof db.deleteImportBatches>[0];
export type DeleteImportBatchesOutput = ReturnType<typeof db.deleteImportBatches>;

export type EmitImportStatsUpdatedInput = Parameters<typeof db.emitImportStatsUpdated>[0];
export type EmitImportStatsUpdatedOutput = ReturnType<typeof db.emitImportStatsUpdated>;

export type ListImportBatchesInput = Parameters<typeof db.listImportBatches>[0];
export type ListImportBatchesOutput = ReturnType<typeof db.listImportBatches>;

export type StartImportBatchInput = Parameters<typeof db.startImportBatch>[0];
export type StartImportBatchOutput = ReturnType<typeof db.startImportBatch>;

export type UpdateFileImportByPathInput = Parameters<typeof db.updateFileImportByPath>[0];
export type UpdateFileImportByPathOutput = ReturnType<typeof db.updateFileImportByPath>;

export type ListFileIdsByTagIdsInput = Parameters<typeof db.listFileIdsByTagIds>[0];
export type ListFileIdsByTagIdsOutput = ReturnType<typeof db.listFileIdsByTagIds>;

export type RegenFileTagAncestorsInput = Parameters<typeof db.regenFileTagAncestors>[0];
export type RegenFileTagAncestorsOutput = ReturnType<typeof db.regenFileTagAncestors>;

export type DeleteFilesInput = Parameters<typeof db.deleteFiles>[0];
export type DeleteFilesOutput = ReturnType<typeof db.deleteFiles>;

export type DetectFacesInput = Parameters<typeof db.detectFaces>[0];
export type DetectFacesOutput = ReturnType<typeof db.detectFaces>;

export type EditFileTagsInput = Parameters<typeof db.editFileTags>[0];
export type EditFileTagsOutput = ReturnType<typeof db.editFileTags>;

export type GetDeletedFileInput = Parameters<typeof db.getDeletedFile>[0];
export type GetDeletedFileOutput = ReturnType<typeof db.getDeletedFile>;

export type GetDiskStatsInput = Parameters<typeof db.getDiskStats>[0];
export type GetDiskStatsOutput = ReturnType<typeof db.getDiskStats>;

export type GetFileByHashInput = Parameters<typeof db.getFileByHash>[0];
export type GetFileByHashOutput = ReturnType<typeof db.getFileByHash>;

export type ImportFileInput = Parameters<typeof db.importFile>[0];
export type ImportFileOutput = ReturnType<typeof db.importFile>;

export type ListDeletedFilesInput = Parameters<typeof db.listDeletedFiles>[0];
export type ListDeletedFilesOutput = ReturnType<typeof db.listDeletedFiles>;

export type ListFaceModelsInput = Parameters<typeof db.listFaceModels>[0];
export type ListFaceModelsOutput = ReturnType<typeof db.listFaceModels>;

export type ListFilesByTagIdsInput = Parameters<typeof db.listFilesByTagIds>[0];
export type ListFilesByTagIdsOutput = ReturnType<typeof db.listFilesByTagIds>;

export type ListFileIdsForCarouselInput = Parameters<typeof db.listFileIdsForCarousel>[0];
export type ListFileIdsForCarouselOutput = ReturnType<typeof db.listFileIdsForCarousel>;

export type ListFilePathsInput = Parameters<typeof db.listFilePaths>[0];
export type ListFilePathsOutput = ReturnType<typeof db.listFilePaths>;

export type ListSortedFileIdsInput = Parameters<typeof db.listSortedFileIds>[0];
export type ListSortedFileIdsOutput = ReturnType<typeof db.listSortedFileIds>;

export type LoadFaceApiNetsInput = Parameters<typeof db.loadFaceApiNets>[0];
export type LoadFaceApiNetsOutput = ReturnType<typeof db.loadFaceApiNets>;

export type RelinkFilesInput = Parameters<typeof db.relinkFiles>[0];
export type RelinkFilesOutput = ReturnType<typeof db.relinkFiles>;

export type SetFileFaceModelsInput = Parameters<typeof db.setFileFaceModels>[0];
export type SetFileFaceModelsOutput = ReturnType<typeof db.setFileFaceModels>;

export type SetFileIsArchivedInput = Parameters<typeof db.setFileIsArchived>[0];
export type SetFileIsArchivedOutput = ReturnType<typeof db.setFileIsArchived>;

export type SetFileRatingInput = Parameters<typeof db.setFileRating>[0];
export type SetFileRatingOutput = ReturnType<typeof db.setFileRating>;

export type UpdateFileInput = Parameters<typeof db.updateFile>[0];
export type UpdateFileOutput = ReturnType<typeof db.updateFile>;

export type DeriveAncestorTagIdsInput = Parameters<typeof db.deriveAncestorTagIds>[0];
export type DeriveAncestorTagIdsOutput = ReturnType<typeof db.deriveAncestorTagIds>;

export type DeriveDescendantTagIdsInput = Parameters<typeof db.deriveDescendantTagIds>[0];
export type DeriveDescendantTagIdsOutput = ReturnType<typeof db.deriveDescendantTagIds>;

export type MakeAncestorIdsMapInput = Parameters<typeof db.makeAncestorIdsMap>[0];
export type MakeAncestorIdsMapOutput = ReturnType<typeof db.makeAncestorIdsMap>;

export type RegenTagsInput = Parameters<typeof db.regenTags>[0];
export type RegenTagsOutput = ReturnType<typeof db.regenTags>;

export type RegenTagAncestorsInput = Parameters<typeof db.regenTagAncestors>[0];
export type RegenTagAncestorsOutput = ReturnType<typeof db.regenTagAncestors>;

export type RegenTagThumbPathsInput = Parameters<typeof db.regenTagThumbPaths>[0];
export type RegenTagThumbPathsOutput = ReturnType<typeof db.regenTagThumbPaths>;

export type CreateTagInput = Parameters<typeof db.createTag>[0];
export type CreateTagOutput = ReturnType<typeof db.createTag>;

export type DeleteTagInput = Parameters<typeof db.deleteTag>[0];
export type DeleteTagOutput = ReturnType<typeof db.deleteTag>;

export type EditTagInput = Parameters<typeof db.editTag>[0];
export type EditTagOutput = ReturnType<typeof db.editTag>;

export type EditMultiTagRelationsInput = Parameters<typeof db.editMultiTagRelations>[0];
export type EditMultiTagRelationsOutput = ReturnType<typeof db.editMultiTagRelations>;

export type MergeTagsInput = Parameters<typeof db.mergeTags>[0];
export type MergeTagsOutput = ReturnType<typeof db.mergeTags>;

export type RecalculateTagCountsInput = Parameters<typeof db.recalculateTagCounts>[0];
export type RecalculateTagCountsOutput = ReturnType<typeof db.recalculateTagCounts>;

export type RefreshTagRelationsInput = Parameters<typeof db.refreshTagRelations>[0];
export type RefreshTagRelationsOutput = ReturnType<typeof db.refreshTagRelations>;

export type RefreshTagInput = Parameters<typeof db.refreshTag>[0];
export type RefreshTagOutput = ReturnType<typeof db.refreshTag>;

export type SetTagCountInput = Parameters<typeof db.setTagCount>[0];
export type SetTagCountOutput = ReturnType<typeof db.setTagCount>;

export type UpsertTagInput = Parameters<typeof db.upsertTag>[0];
export type UpsertTagOutput = ReturnType<typeof db.upsertTag>;
