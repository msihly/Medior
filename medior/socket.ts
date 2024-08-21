import {
  socketEvents as _socketEvents,
  SocketEmitEvents as _SocketEmitEvents,
} from "medior/_generated/socket";
import * as db from "medior/database";

export interface SocketEmitEvents extends _SocketEmitEvents {
  onFilesArchived: (args: { fileIds: string[] }) => void;
  onFilesDeleted: (args: { fileHashes: string[]; fileIds: string[] }) => void;
  onFilesUpdated: (args: { fileIds: string[]; updates: Partial<db.FileSchema> }) => void;
  onFileTagsUpdated: (args: {
    addedTagIds: string[];
    batchId?: string;
    fileIds?: string[];
    removedTagIds: string[];
  }) => void;
  onImportBatchCompleted: () => void;
  onImportStatsUpdated: (args: { importStats: db.ImportStats }) => void;
  onReloadFileCollections: () => void;
  onReloadFiles: () => void;
  onReloadImportBatches: () => void;
  onReloadRegExMaps: () => void;
  onReloadTags: () => void;
  onTagMerged: (args: { oldTagId: string; newTagId: string }) => void;
  onTagsUpdated: (args: {
    tags: Array<{ tagId: string; updates: Partial<db.TagSchema> }>;
    withFileReload: boolean;
  }) => void;
}

export type SocketEmitEvent = keyof SocketEmitEvents;

export const socketEvents: SocketEmitEvent[] = [..._socketEvents];

export interface SocketEvents extends SocketEmitEvents {
  connected: () => void;
}
