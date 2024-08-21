/* -------------------------------------------------------------------------- */
/*                    THIS IS A GENERATED FILE. DO NOT EDIT.                  */
/* -------------------------------------------------------------------------- */

import { initTRPC } from "@trpc/server";
import * as db from "medior/database";
import * as actions from "./actions";

export const trpc = initTRPC.create();

/** All resources defined as mutation to deal with max length URLs in GET requests.
 *  @see https://github.com/trpc/trpc/discussions/1936
 */
export const serverEndpoint = <Input, Output>(fn: (input: Input) => Promise<Output>) =>
  trpc.procedure.input((input: Input) => input).mutation(({ input }) => fn(input));

export const serverRouter = trpc.router({
  /** Model actions */
  createDeletedFile: serverEndpoint(actions.createDeletedFile),
  deleteDeletedFile: serverEndpoint(actions.deleteDeletedFile),
  _listDeletedFiles: serverEndpoint(actions._listDeletedFiles),
  updateDeletedFile: serverEndpoint(actions.updateDeletedFile),
  createFileCollection: serverEndpoint(actions.createFileCollection),
  deleteFileCollection: serverEndpoint(actions.deleteFileCollection),
  listFileCollections: serverEndpoint(actions.listFileCollections),
  updateFileCollection: serverEndpoint(actions.updateFileCollection),
  createFileImportBatch: serverEndpoint(actions.createFileImportBatch),
  deleteFileImportBatch: serverEndpoint(actions.deleteFileImportBatch),
  listFileImportBatchs: serverEndpoint(actions.listFileImportBatchs),
  updateFileImportBatch: serverEndpoint(actions.updateFileImportBatch),
  createFile: serverEndpoint(actions.createFile),
  deleteFile: serverEndpoint(actions.deleteFile),
  listFiles: serverEndpoint(actions.listFiles),
  _updateFile: serverEndpoint(actions._updateFile),
  createRegExMap: serverEndpoint(actions.createRegExMap),
  deleteRegExMap: serverEndpoint(actions.deleteRegExMap),
  listRegExMaps: serverEndpoint(actions.listRegExMaps),
  updateRegExMap: serverEndpoint(actions.updateRegExMap),
  _createTag: serverEndpoint(actions._createTag),
  _deleteTag: serverEndpoint(actions._deleteTag),
  _listTags: serverEndpoint(actions._listTags),
  updateTag: serverEndpoint(actions.updateTag),
  /** Custom actions */
  createCollection: serverEndpoint(db.createCollection),
  deleteCollection: serverEndpoint(db.deleteCollection),
  deleteEmptyCollections: serverEndpoint(db.deleteEmptyCollections),
  listAllCollectionIds: serverEndpoint(db.listAllCollectionIds),
  listCollectionIdsByTagIds: serverEndpoint(db.listCollectionIdsByTagIds),
  listFilteredCollections: serverEndpoint(db.listFilteredCollections),
  regenCollAttrs: serverEndpoint(db.regenCollAttrs),
  regenCollRating: serverEndpoint(db.regenCollRating),
  regenCollTagAncestors: serverEndpoint(db.regenCollTagAncestors),
  updateCollection: serverEndpoint(db.updateCollection),
  completeImportBatch: serverEndpoint(db.completeImportBatch),
  createImportBatches: serverEndpoint(db.createImportBatches),
  deleteImportBatches: serverEndpoint(db.deleteImportBatches),
  emitImportStatsUpdated: serverEndpoint(db.emitImportStatsUpdated),
  listImportBatches: serverEndpoint(db.listImportBatches),
  startImportBatch: serverEndpoint(db.startImportBatch),
  updateFileImportByPath: serverEndpoint(db.updateFileImportByPath),
  listFileIdsByTagIds: serverEndpoint(db.listFileIdsByTagIds),
  regenFileTagAncestors: serverEndpoint(db.regenFileTagAncestors),
  deleteFiles: serverEndpoint(db.deleteFiles),
  detectFaces: serverEndpoint(db.detectFaces),
  editFileTags: serverEndpoint(db.editFileTags),
  getDeletedFile: serverEndpoint(db.getDeletedFile),
  getDiskStats: serverEndpoint(db.getDiskStats),
  getFileByHash: serverEndpoint(db.getFileByHash),
  getShiftSelectedFiles: serverEndpoint(db.getShiftSelectedFiles),
  importFile: serverEndpoint(db.importFile),
  listDeletedFiles: serverEndpoint(db.listDeletedFiles),
  listFaceModels: serverEndpoint(db.listFaceModels),
  listFilesByTagIds: serverEndpoint(db.listFilesByTagIds),
  listFileIdsForCarousel: serverEndpoint(db.listFileIdsForCarousel),
  listFilePaths: serverEndpoint(db.listFilePaths),
  listFilteredFiles: serverEndpoint(db.listFilteredFiles),
  loadFaceApiNets: serverEndpoint(db.loadFaceApiNets),
  relinkFiles: serverEndpoint(db.relinkFiles),
  setFileFaceModels: serverEndpoint(db.setFileFaceModels),
  setFileIsArchived: serverEndpoint(db.setFileIsArchived),
  setFileRating: serverEndpoint(db.setFileRating),
  updateFile: serverEndpoint(db.updateFile),
  deriveAncestorTagIds: serverEndpoint(db.deriveAncestorTagIds),
  deriveDescendantTagIds: serverEndpoint(db.deriveDescendantTagIds),
  makeAncestorIdsMap: serverEndpoint(db.makeAncestorIdsMap),
  regenTags: serverEndpoint(db.regenTags),
  regenTagAncestors: serverEndpoint(db.regenTagAncestors),
  regenTagThumbPaths: serverEndpoint(db.regenTagThumbPaths),
  createTag: serverEndpoint(db.createTag),
  deleteTag: serverEndpoint(db.deleteTag),
  editTag: serverEndpoint(db.editTag),
  editMultiTagRelations: serverEndpoint(db.editMultiTagRelations),
  getShiftSelectedTags: serverEndpoint(db.getShiftSelectedTags),
  listFilteredTags: serverEndpoint(db.listFilteredTags),
  listTags: serverEndpoint(db.listTags),
  mergeTags: serverEndpoint(db.mergeTags),
  recalculateTagCounts: serverEndpoint(db.recalculateTagCounts),
  refreshTagRelations: serverEndpoint(db.refreshTagRelations),
  refreshTag: serverEndpoint(db.refreshTag),
  setTagCount: serverEndpoint(db.setTagCount),
  upsertTag: serverEndpoint(db.upsertTag),
});
