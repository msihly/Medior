/* -------------------------------------------------------------------------- */
/*                    THIS IS A GENERATED FILE. DO NOT EDIT.                  */
/* -------------------------------------------------------------------------- */

import {
  DeletedFileSchema,
  FileCollectionSchema,
  FileImportBatchSchema,
  FileSchema,
  RegExMapSchema,
  TagSchema,
} from "medior/database";

/* ------------------------------------ Socket Definitions ----------------------------------- */
export type SocketEventOptions = { contentId: string; tabId: number };

export interface SocketEmitEvents {
  onDeletedFileCreated: (args: DeletedFileSchema, options?: SocketEventOptions) => void;
  onDeletedFileDeleted: (args: { id: string }, options?: SocketEventOptions) => void;
  onDeletedFileUpdated: (
    args: { id: string; updates: Partial<DeletedFileSchema> },
    options?: SocketEventOptions,
  ) => void;
  onFileCollectionCreated: (args: FileCollectionSchema, options?: SocketEventOptions) => void;
  onFileCollectionDeleted: (args: { id: string }, options?: SocketEventOptions) => void;
  onFileCollectionUpdated: (
    args: { id: string; updates: Partial<FileCollectionSchema> },
    options?: SocketEventOptions,
  ) => void;
  onFileImportBatchCreated: (args: FileImportBatchSchema, options?: SocketEventOptions) => void;
  onFileImportBatchDeleted: (args: { id: string }, options?: SocketEventOptions) => void;
  onFileImportBatchUpdated: (
    args: { id: string; updates: Partial<FileImportBatchSchema> },
    options?: SocketEventOptions,
  ) => void;
  onFileCreated: (args: FileSchema, options?: SocketEventOptions) => void;
  onFileDeleted: (args: { id: string }, options?: SocketEventOptions) => void;
  onFileUpdated: (
    args: { id: string; updates: Partial<FileSchema> },
    options?: SocketEventOptions,
  ) => void;
  onRegExMapCreated: (args: RegExMapSchema, options?: SocketEventOptions) => void;
  onRegExMapDeleted: (args: { id: string }, options?: SocketEventOptions) => void;
  onRegExMapUpdated: (
    args: { id: string; updates: Partial<RegExMapSchema> },
    options?: SocketEventOptions,
  ) => void;
  onTagCreated: (args: TagSchema, options?: SocketEventOptions) => void;
  onTagDeleted: (args: { id: string }, options?: SocketEventOptions) => void;
  onTagUpdated: (
    args: { id: string; updates: Partial<TagSchema> },
    options?: SocketEventOptions,
  ) => void;
}

export type SocketEmitEvent = keyof SocketEmitEvents;

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
  "onRegExMapCreated",
  "onRegExMapDeleted",
  "onRegExMapUpdated",
  "onTagCreated",
  "onTagDeleted",
  "onTagUpdated",
];
