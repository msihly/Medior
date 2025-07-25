/* --------------------------------------------------------------------------- */
/*                               THIS IS A GENERATED FILE. DO NOT EDIT.
/* --------------------------------------------------------------------------- */
import { model, Schema } from "mongoose";

/* --------------------------------------------------------------------------- */
/*                               DeletedFile
/* --------------------------------------------------------------------------- */

export interface DeletedFileSchema {
  id: string;
  dateCreated: string;
  hash: string;
}

const DeletedFileSchema = new Schema<DeletedFileSchema>({
  id: String,
  dateCreated: String,
  hash: String,
});

DeletedFileSchema.index({ dateCreated: 1, _id: 1 }, { unique: true });
DeletedFileSchema.index({ hash: 1 }, { unique: true });

export const DeletedFileModel = model<DeletedFileSchema>("DeletedFile", DeletedFileSchema);

/* --------------------------------------------------------------------------- */
/*                               FileCollection
/* --------------------------------------------------------------------------- */

export interface FileCollectionSchema {
  id: string;
  dateCreated: string;
  dateModified: string;
  fileCount: number;
  fileIdIndexes: Array<{ fileId: string; index: number }>;
  rating: number;
  tagIds: string[];
  tagIdsWithAncestors: string[];
  thumbs: Array<{ frameHeight?: number; frameWidth?: number; path: string }>;
  title: string;
}

const FileCollectionSchema = new Schema<FileCollectionSchema>({
  id: String,
  dateCreated: String,
  dateModified: String,
  fileCount: Number,
  fileIdIndexes: [{ fileId: Schema.Types.ObjectId, index: Number }],
  rating: Number,
  tagIds: [{ type: Schema.Types.ObjectId, ref: "Tag" }],
  tagIdsWithAncestors: [{ type: Schema.Types.ObjectId, ref: "Tag" }],
  thumbs: [{ frameHeight: Number, frameWidth: Number, path: String }],
  title: String,
});

FileCollectionSchema.index({ dateCreated: 1, _id: 1 }, { unique: true });
FileCollectionSchema.index({ dateModified: 1, _id: 1 }, { unique: true });
FileCollectionSchema.index({ fileCount: 1, _id: 1 }, { unique: true });
FileCollectionSchema.index({ rating: 1, _id: 1 }, { unique: true });
FileCollectionSchema.index({ tagIds: 1, _id: 1 }, { unique: true });
FileCollectionSchema.index({ tagIdsWithAncestors: 1, _id: 1 }, { unique: true });
FileCollectionSchema.index({ title: 1, _id: 1 }, { unique: true });

export const FileCollectionModel = model<FileCollectionSchema>(
  "FileCollection",
  FileCollectionSchema,
);

/* --------------------------------------------------------------------------- */
/*                               FileImportBatch
/* --------------------------------------------------------------------------- */

export interface FileImport {
  dateCreated: string;
  diffusionParams: string;
  errorMsg: string;
  extension: string;
  fileId: string;
  name: string;
  path: string;
  size: number;
  status: string | "COMPLETE" | "DELETED" | "DUPLICATE" | "ERROR" | "PENDING";
  tagIds: string[];
  thumb: { frameHeight?: number; frameWidth?: number; path: string };
}

export interface FileImportBatchSchema {
  id: string;
  dateCreated: string;
  collectionId?: string;
  collectionTitle?: string;
  completedAt: string;
  deleteOnImport: boolean;
  ignorePrevDeleted: boolean;
  imports?: FileImport[];
  remux?: boolean;
  rootFolderPath: string;
  startedAt?: string;
  tagIds: string[];
}

const FileImportBatchSchema = new Schema<FileImportBatchSchema>({
  id: String,
  dateCreated: String,
  collectionId: String,
  collectionTitle: String,
  completedAt: String,
  deleteOnImport: Boolean,
  ignorePrevDeleted: Boolean,
  imports: [
    {
      dateCreated: String,
      diffusionParams: String,
      errorMsg: String,
      extension: String,
      fileId: { type: Schema.Types.ObjectId, ref: "File" },
      name: String,
      path: String,
      size: Number,
      status: { type: String, enum: ["COMPLETE", "DELETED", "DUPLICATE", "ERROR", "PENDING"] },
      tagIds: [{ type: Schema.Types.ObjectId, ref: "Tag" }],
      thumb: { frameHeight: Number, frameWidth: Number, path: String },
    },
  ],
  remux: Boolean,
  rootFolderPath: String,
  startedAt: String,
  tagIds: [{ type: Schema.Types.ObjectId, ref: "Tag" }],
});

FileImportBatchSchema.index({ dateCreated: 1, _id: 1 }, { unique: true });

export const FileImportBatchModel = model<FileImportBatchSchema>(
  "FileImportBatch",
  FileImportBatchSchema,
);

/* --------------------------------------------------------------------------- */
/*                               File
/* --------------------------------------------------------------------------- */

export interface FaceModel {
  box: { height: number; width: number; x: number; y: number };
  descriptors: string;
  fileId: string;
  tagId: string;
}

export interface FileSchema {
  id: string;
  dateCreated: string;
  dateModified: string;
  diffusionParams?: string;
  duration?: number;
  ext: string;
  faceModels?: FaceModel[];
  frameRate?: number;
  hash: string;
  height: number;
  isArchived?: boolean;
  isCorrupted?: boolean;
  originalHash?: string;
  originalName?: string;
  originalPath: string;
  path: string;
  rating: number;
  size: number;
  tagIds: string[];
  tagIdsWithAncestors: string[];
  thumb: { frameHeight?: number; frameWidth?: number; path: string };
  videoCodec?: string;
  width: number;
}

const FileSchema = new Schema<FileSchema>({
  id: String,
  dateCreated: String,
  dateModified: String,
  diffusionParams: String,
  duration: Number,
  ext: String,
  faceModels: [
    {
      box: { height: Number, width: Number, x: Number, y: Number },
      descriptors: [Object],
      fileId: { type: Schema.Types.ObjectId, ref: "File" },
      tagId: { type: Schema.Types.ObjectId, ref: "Tag" },
    },
  ],
  frameRate: Number,
  hash: String,
  height: Number,
  isArchived: Boolean,
  isCorrupted: Boolean,
  originalHash: String,
  originalName: String,
  originalPath: String,
  path: String,
  rating: Number,
  size: Number,
  tagIds: [{ type: Schema.Types.ObjectId, ref: "Tag" }],
  tagIdsWithAncestors: [{ type: Schema.Types.ObjectId, ref: "Tag" }],
  thumb: { frameHeight: Number, frameWidth: Number, path: String },
  videoCodec: String,
  width: Number,
});

FileSchema.index({ dateCreated: 1, _id: 1 }, { unique: true });
FileSchema.index({ dateModified: 1, _id: 1 }, { unique: true });
FileSchema.index({ duration: 1, _id: 1 }, { unique: true });
FileSchema.index({ ext: 1, _id: 1 }, { unique: true });
FileSchema.index({ hash: 1 }, { unique: true });
FileSchema.index({ height: 1, _id: 1 }, { unique: true });
FileSchema.index({ isArchived: 1, ext: 1, tagIds: 1, _id: 1 }, { unique: true });
FileSchema.index({ isArchived: 1, ext: 1, tagIdsWithAncestors: 1, _id: 1 }, { unique: true });
FileSchema.index({ isCorrupted: 1, _id: 1 }, { unique: true });
FileSchema.index({ originalHash: 1, _id: 1 }, { unique: true });
FileSchema.index({ originalPath: 1, _id: 1 }, { unique: true });
FileSchema.index({ path: 1, _id: 1 }, { unique: true });
FileSchema.index({ rating: 1, _id: 1 }, { unique: true });
FileSchema.index({ size: 1, _id: 1 }, { unique: true });
FileSchema.index({ tagIds: 1, _id: 1 }, { unique: true });
FileSchema.index({ tagIdsWithAncestors: 1, _id: 1 }, { unique: true });
FileSchema.index({ width: 1, _id: 1 }, { unique: true });

export const FileModel = model<FileSchema>("File", FileSchema);

/* --------------------------------------------------------------------------- */
/*                               Tag
/* --------------------------------------------------------------------------- */

export interface TagSchema {
  id: string;
  dateCreated: string;
  aliases: string[];
  ancestorIds: string[];
  childIds: string[];
  count: number;
  dateModified: string;
  descendantIds: string[];
  label: string;
  parentIds: string[];
  regEx?: string;
  thumb: { frameHeight?: number; frameWidth?: number; path: string };
}

const TagSchema = new Schema<TagSchema>({
  id: String,
  dateCreated: String,
  aliases: [String],
  ancestorIds: [{ type: Schema.Types.ObjectId, ref: "Tag" }],
  childIds: [{ type: Schema.Types.ObjectId, ref: "Tag" }],
  count: Number,
  dateModified: String,
  descendantIds: [{ type: Schema.Types.ObjectId, ref: "Tag" }],
  label: String,
  parentIds: [{ type: Schema.Types.ObjectId, ref: "Tag" }],
  regEx: String,
  thumb: { frameHeight: Number, frameWidth: Number, path: String },
});

TagSchema.index({ dateCreated: 1, _id: 1 }, { unique: true });
TagSchema.index({ label: 1 }, { unique: true });

export const TagModel = model<TagSchema>("Tag", TagSchema);
