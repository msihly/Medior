/* -------------------------------------------------------------------------- */
/*                    THIS IS A GENERATED FILE. DO NOT EDIT.                  */
/* -------------------------------------------------------------------------- */

import { initTRPC } from "@trpc/server";
import * as db from "medior/database/actions";

export const trpc = initTRPC.create();

/** All resources defined as mutation to deal with max length URLs in GET requests.
 *  @see https://github.com/trpc/trpc/discussions/1936
 */
export const serverEndpoint = <Input, Output>(fn: (input: Input) => Promise<Output>) =>
  trpc.procedure.input((input: Input) => input).mutation(({ input }) => fn(input));

export const serverRouter = trpc.router({
  /** Model actions */
  _createTag: serverEndpoint(db._createTag),
  _deleteTag: serverEndpoint(db._deleteTag),
  _listDeletedFiles: serverEndpoint(db._listDeletedFiles),
  _listTags: serverEndpoint(db._listTags),
  _updateFile: serverEndpoint(db._updateFile),
  createDeletedFile: serverEndpoint(db.createDeletedFile),
  createFile: serverEndpoint(db.createFile),
  createFileCollection: serverEndpoint(db.createFileCollection),
  createFileImportBatch: serverEndpoint(db.createFileImportBatch),
  createRegExMap: serverEndpoint(db.createRegExMap),
  deleteDeletedFile: serverEndpoint(db.deleteDeletedFile),
  deleteFile: serverEndpoint(db.deleteFile),
  deleteFileCollection: serverEndpoint(db.deleteFileCollection),
  deleteFileImportBatch: serverEndpoint(db.deleteFileImportBatch),
  deleteRegExMap: serverEndpoint(db.deleteRegExMap),
  listFileCollections: serverEndpoint(db.listFileCollections),
  listFileImportBatchs: serverEndpoint(db.listFileImportBatchs),
  listFiles: serverEndpoint(db.listFiles),
  listRegExMaps: serverEndpoint(db.listRegExMaps),
  updateDeletedFile: serverEndpoint(db.updateDeletedFile),
  updateFileCollection: serverEndpoint(db.updateFileCollection),
  updateFileImportBatch: serverEndpoint(db.updateFileImportBatch),
  updateRegExMap: serverEndpoint(db.updateRegExMap),
  updateTag: serverEndpoint(db.updateTag),
  /** Search store actions */
  getShiftSelectedFileCollections: serverEndpoint(db.getShiftSelectedFileCollections),
  getShiftSelectedFiles: serverEndpoint(db.getShiftSelectedFiles),
  getShiftSelectedTags: serverEndpoint(db.getShiftSelectedTags),
  listFilteredFileCollections: serverEndpoint(db.listFilteredFileCollections),
  listFilteredFiles: serverEndpoint(db.listFilteredFiles),
  listFilteredTags: serverEndpoint(db.listFilteredTags),
  /** Custom actions */
  completeImportBatch: serverEndpoint(db.completeImportBatch),
  createCollection: serverEndpoint(db.createCollection),
  createImportBatches: serverEndpoint(db.createImportBatches),
  createTag: serverEndpoint(db.createTag),
  deduplicateCollections: serverEndpoint(db.deduplicateCollections),
  deleteCollections: serverEndpoint(db.deleteCollections),
  deleteEmptyCollections: serverEndpoint(db.deleteEmptyCollections),
  deleteFiles: serverEndpoint(db.deleteFiles),
  deleteImportBatches: serverEndpoint(db.deleteImportBatches),
  deleteTag: serverEndpoint(db.deleteTag),
  deriveAncestorTagIds: serverEndpoint(db.deriveAncestorTagIds),
  deriveDescendantTagIds: serverEndpoint(db.deriveDescendantTagIds),
  detectFaces: serverEndpoint(db.detectFaces),
  editFileTags: serverEndpoint(db.editFileTags),
  editMultiTagRelations: serverEndpoint(db.editMultiTagRelations),
  editTag: serverEndpoint(db.editTag),
  emitImportStatsUpdated: serverEndpoint(db.emitImportStatsUpdated),
  getDeletedFile: serverEndpoint(db.getDeletedFile),
  getDiskStats: serverEndpoint(db.getDiskStats),
  getFileByHash: serverEndpoint(db.getFileByHash),
  importFile: serverEndpoint(db.importFile),
  listAllCollectionIds: serverEndpoint(db.listAllCollectionIds),
  listCollectionIdsByTagIds: serverEndpoint(db.listCollectionIdsByTagIds),
  listDeletedFiles: serverEndpoint(db.listDeletedFiles),
  listFaceModels: serverEndpoint(db.listFaceModels),
  listFileIdsByTagIds: serverEndpoint(db.listFileIdsByTagIds),
  listFileIdsForCarousel: serverEndpoint(db.listFileIdsForCarousel),
  listFilePaths: serverEndpoint(db.listFilePaths),
  listFilesByTagIds: serverEndpoint(db.listFilesByTagIds),
  listImportBatches: serverEndpoint(db.listImportBatches),
  listTags: serverEndpoint(db.listTags),
  loadFaceApiNets: serverEndpoint(db.loadFaceApiNets),
  makeAncestorIdsMap: serverEndpoint(db.makeAncestorIdsMap),
  mergeTags: serverEndpoint(db.mergeTags),
  recalculateTagCounts: serverEndpoint(db.recalculateTagCounts),
  refreshTag: serverEndpoint(db.refreshTag),
  refreshTagRelations: serverEndpoint(db.refreshTagRelations),
  regenCollAttrs: serverEndpoint(db.regenCollAttrs),
  regenCollRating: serverEndpoint(db.regenCollRating),
  regenCollTagAncestors: serverEndpoint(db.regenCollTagAncestors),
  regenFileTagAncestors: serverEndpoint(db.regenFileTagAncestors),
  regenTagAncestors: serverEndpoint(db.regenTagAncestors),
  regenTagThumbPaths: serverEndpoint(db.regenTagThumbPaths),
  regenTags: serverEndpoint(db.regenTags),
  relinkFiles: serverEndpoint(db.relinkFiles),
  setFileFaceModels: serverEndpoint(db.setFileFaceModels),
  setFileIsArchived: serverEndpoint(db.setFileIsArchived),
  setFileRating: serverEndpoint(db.setFileRating),
  setTagCount: serverEndpoint(db.setTagCount),
  startImportBatch: serverEndpoint(db.startImportBatch),
  updateCollection: serverEndpoint(db.updateCollection),
  updateFile: serverEndpoint(db.updateFile),
  updateFileImportByPath: serverEndpoint(db.updateFileImportByPath),
  upsertTag: serverEndpoint(db.upsertTag),
});
