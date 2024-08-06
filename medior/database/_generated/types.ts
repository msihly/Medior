import * as db from "medior/database";

/* ----------------------------- collections.ts ----------------------------- */
export type CreateCollectionFilterPipelineInput = Parameters<
  typeof db.createCollectionFilterPipeline
>[0];
export type CreateCollectionFilterPipelineOutput = ReturnType<
  typeof db.createCollectionFilterPipeline
>;

export type CreateCollectionInput = Parameters<typeof db.createCollection>[0];
export type CreateCollectionOutput = ReturnType<typeof db.createCollection>;

export type DeleteCollectionInput = Parameters<typeof db.deleteCollection>[0];
export type DeleteCollectionOutput = ReturnType<typeof db.deleteCollection>;

export type DeleteEmptyCollectionsInput = Parameters<typeof db.deleteEmptyCollections>[0];
export type DeleteEmptyCollectionsOutput = ReturnType<typeof db.deleteEmptyCollections>;

export type ListAllCollectionIdsInput = Parameters<typeof db.listAllCollectionIds>[0];
export type ListAllCollectionIdsOutput = ReturnType<typeof db.listAllCollectionIds>;

export type ListCollectionIdsByTagIdsInput = Parameters<typeof db.listCollectionIdsByTagIds>[0];
export type ListCollectionIdsByTagIdsOutput = ReturnType<typeof db.listCollectionIdsByTagIds>;

export type ListFilteredCollectionsInput = Parameters<typeof db.listFilteredCollections>[0];
export type ListFilteredCollectionsOutput = ReturnType<typeof db.listFilteredCollections>;

export type RegenCollAttrsInput = Parameters<typeof db.regenCollAttrs>[0];
export type RegenCollAttrsOutput = ReturnType<typeof db.regenCollAttrs>;

export type RegenCollRatingInput = Parameters<typeof db.regenCollRating>[0];
export type RegenCollRatingOutput = ReturnType<typeof db.regenCollRating>;

export type RegenCollTagAncestorsInput = Parameters<typeof db.regenCollTagAncestors>[0];
export type RegenCollTagAncestorsOutput = ReturnType<typeof db.regenCollTagAncestors>;

export type UpdateCollectionInput = Parameters<typeof db.updateCollection>[0];
export type UpdateCollectionOutput = ReturnType<typeof db.updateCollection>;

/* ----------------------------- file-imports.ts ----------------------------- */
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

/* ----------------------------- files.ts ----------------------------- */
export type CreateFileFilterPipelineInput = Parameters<typeof db.createFileFilterPipeline>[0];
export type CreateFileFilterPipelineOutput = ReturnType<typeof db.createFileFilterPipeline>;

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

export type GetShiftSelectedFilesInput = Parameters<typeof db.getShiftSelectedFiles>[0];
export type GetShiftSelectedFilesOutput = ReturnType<typeof db.getShiftSelectedFiles>;

export type ImportFileInput = Parameters<typeof db.importFile>[0];
export type ImportFileOutput = ReturnType<typeof db.importFile>;

export type ListDeletedFilesInput = Parameters<typeof db.listDeletedFiles>[0];
export type ListDeletedFilesOutput = ReturnType<typeof db.listDeletedFiles>;

export type ListFaceModelsInput = Parameters<typeof db.listFaceModels>[0];
export type ListFaceModelsOutput = ReturnType<typeof db.listFaceModels>;

export type ListFilesInput = Parameters<typeof db.listFiles>[0];
export type ListFilesOutput = ReturnType<typeof db.listFiles>;

export type ListFilesByTagIdsInput = Parameters<typeof db.listFilesByTagIds>[0];
export type ListFilesByTagIdsOutput = ReturnType<typeof db.listFilesByTagIds>;

export type ListFileIdsForCarouselInput = Parameters<typeof db.listFileIdsForCarousel>[0];
export type ListFileIdsForCarouselOutput = ReturnType<typeof db.listFileIdsForCarousel>;

export type ListFilePathsInput = Parameters<typeof db.listFilePaths>[0];
export type ListFilePathsOutput = ReturnType<typeof db.listFilePaths>;

export type ListFilteredFilesInput = Parameters<typeof db.listFilteredFiles>[0];
export type ListFilteredFilesOutput = ReturnType<typeof db.listFilteredFiles>;

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

/* ----------------------------- tags.ts ----------------------------- */
export type CreateTagFilterPipelineInput = Parameters<typeof db.createTagFilterPipeline>[0];
export type CreateTagFilterPipelineOutput = ReturnType<typeof db.createTagFilterPipeline>;

export type DeriveAncestorTagIdsInput = Parameters<typeof db.deriveAncestorTagIds>[0];
export type DeriveAncestorTagIdsOutput = ReturnType<typeof db.deriveAncestorTagIds>;

export type DeriveDescendantTagIdsInput = Parameters<typeof db.deriveDescendantTagIds>[0];
export type DeriveDescendantTagIdsOutput = ReturnType<typeof db.deriveDescendantTagIds>;

export type MakeAncestorIdsMapInput = Parameters<typeof db.makeAncestorIdsMap>[0];
export type MakeAncestorIdsMapOutput = ReturnType<typeof db.makeAncestorIdsMap>;

export type MakeUniqueAncestorUpdatesInput = Parameters<typeof db.makeUniqueAncestorUpdates>[0];
export type MakeUniqueAncestorUpdatesOutput = ReturnType<typeof db.makeUniqueAncestorUpdates>;

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

export type GetShiftSelectedTagsInput = Parameters<typeof db.getShiftSelectedTags>[0];
export type GetShiftSelectedTagsOutput = ReturnType<typeof db.getShiftSelectedTags>;

export type ListFilteredTagsInput = Parameters<typeof db.listFilteredTags>[0];
export type ListFilteredTagsOutput = ReturnType<typeof db.listFilteredTags>;

export type ListTagsInput = Parameters<typeof db.listTags>[0];
export type ListTagsOutput = ReturnType<typeof db.listTags>;

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
