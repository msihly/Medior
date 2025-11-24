/* --------------------------------------------------------------------------- */
/*                               THIS IS A GENERATED FILE. DO NOT EDIT.
/* --------------------------------------------------------------------------- */
import * as Types from "medior/server/database/types";
import * as models from "medior/_generated/models";
/* --------------------------------------------------------------------------- */
/*                               Socket Definitions
/* --------------------------------------------------------------------------- */

export type SocketEventOptions = { contentId: string; tabId: number };

export interface SocketEmitEvents {
  onDeletedFileCreated: (args: models.DeletedFileSchema, options?: SocketEventOptions) => void;
  onDeletedFileDeleted: (args: { ids: string[] }, options?: SocketEventOptions) => void;
  onDeletedFileUpdated: (
    args: { id: string; updates: Partial<models.DeletedFileSchema> },
    options?: SocketEventOptions,
  ) => void;
  onFileCollectionCreated: (
    args: models.FileCollectionSchema,
    options?: SocketEventOptions,
  ) => void;
  onFileCollectionDeleted: (args: { ids: string[] }, options?: SocketEventOptions) => void;
  onFileCollectionUpdated: (
    args: { id: string; updates: Partial<models.FileCollectionSchema> },
    options?: SocketEventOptions,
  ) => void;
  onFileImportBatchCreated: (
    args: models.FileImportBatchSchema,
    options?: SocketEventOptions,
  ) => void;
  onFileImportBatchDeleted: (args: { ids: string[] }, options?: SocketEventOptions) => void;
  onFileImportBatchUpdated: (
    args: { id: string; updates: Partial<models.FileImportBatchSchema> },
    options?: SocketEventOptions,
  ) => void;
  onFileCreated: (args: models.FileSchema, options?: SocketEventOptions) => void;
  onFileDeleted: (args: { ids: string[] }, options?: SocketEventOptions) => void;
  onFileUpdated: (
    args: { id: string; updates: Partial<models.FileSchema> },
    options?: SocketEventOptions,
  ) => void;
  onTagCreated: (args: models.TagSchema, options?: SocketEventOptions) => void;
  onTagDeleted: (args: { ids: string[] }, options?: SocketEventOptions) => void;
  onTagUpdated: (
    args: { id: string; updates: Partial<models.TagSchema> },
    options?: SocketEventOptions,
  ) => void;
  onFileCollectionsDeleted: (args: { ids: string[] }, options?: SocketEventOptions) => void;
  onFilesArchived: (args: { fileIds: string[] }, options?: SocketEventOptions) => void;
  onFilesDeleted: (
    args: { fileHashes: string[]; fileIds: string[] },
    options?: SocketEventOptions,
  ) => void;
  onFilesUpdated: (
    args: { fileIds: string[]; updates: Partial<models.FileSchema> },
    options?: SocketEventOptions,
  ) => void;
  onFileImportUpdated: (
    args: {
      batchId: string;
      errorMsg?: string;
      fileId?: string;
      filePath: string;
      status?: Types.ImportStatus;
    },
    options?: SocketEventOptions,
  ) => void;
  onFileTagsUpdated: (
    args: { addedTagIds: string[]; batchId?: string; fileIds?: string[]; removedTagIds: string[] },
    options?: SocketEventOptions,
  ) => void;
  onImportBatchCompleted: (args: { id: string }, options?: SocketEventOptions) => void;
  onImportBatchLoaded: (args: { id: string }, options?: SocketEventOptions) => void;
  onImporterStatusUpdated: (options?: SocketEventOptions) => void;
  onImportStatsUpdated: (
    args: { importStats: Types.ImportStats },
    options?: SocketEventOptions,
  ) => void;
  onReloadFileCollections: (options?: SocketEventOptions) => void;
  onReloadFiles: (options?: SocketEventOptions) => void;
  onReloadImportBatches: (options?: SocketEventOptions) => void;
  onReloadRegExMaps: (options?: SocketEventOptions) => void;
  onReloadTags: (options?: SocketEventOptions) => void;
  onTagMerged: (args: { oldTagId: string; newTagId: string }, options?: SocketEventOptions) => void;
  onTagsUpdated: (
    args: {
      tags: Array<{ tagId: string; updates: Partial<models.TagSchema> }>;
      withFileReload: boolean;
    },
    options?: SocketEventOptions,
  ) => void;
}

export type SocketEmitEvent = keyof SocketEmitEvents;

export interface SocketEvents extends SocketEmitEvents {
  connected: () => void;
}

export const socketEvents: SocketEmitEvent[] = [
  "onDeletedFileCreated",
  "onDeletedFileDeleted",
  "onDeletedFileUpdated",
  "onFileCollectionCreated",
  "onFileCollectionDeleted",
  "onFileCollectionUpdated",
  "onFileImportBatchCreated",
  "onFileImportBatchDeleted",
  "onFileImportBatchUpdated",
  "onFileCreated",
  "onFileDeleted",
  "onFileUpdated",
  "onTagCreated",
  "onTagDeleted",
  "onTagUpdated",
  "onFileCollectionsDeleted",
  "onFilesArchived",
  "onFilesDeleted",
  "onFilesUpdated",
  "onFileImportUpdated",
  "onFileTagsUpdated",
  "onImportBatchCompleted",
  "onImportBatchLoaded",
  "onImporterStatusUpdated",
  "onImportStatsUpdated",
  "onReloadFileCollections",
  "onReloadFiles",
  "onReloadImportBatches",
  "onReloadRegExMaps",
  "onReloadTags",
  "onTagMerged",
  "onTagsUpdated",
];
