/* --------------------------------------------------------------------------- */
/*                               THIS IS A GENERATED FILE. DO NOT EDIT.
/* --------------------------------------------------------------------------- */
import { model, Schema } from "mongoose";
import { mediaPathPlugin } from "medior/server/database/media-paths";
import { backgroundExecutionPlugin } from "medior/server/database/database-context";
import { mediaAncestryPlugin, tagAncestryPlugin } from "medior/server/database/tag-ancestry";
import { IconName } from "medior/components";
import { CssColor } from "medior/utils/client";

/* --------------------------------------------------------------------------- */
/*                               BackgroundOperation
/* --------------------------------------------------------------------------- */

export interface BackgroundOperationSchema {
  completedAt?: string;
  dateCreated: string;
  dateModified: string;
  dismissedAt?: string;
  error?: string;
  failures?: Array<{ message: string; targetId: string }>;
  id: string;
  label: string;
  message?: string;
  processedCount: number;
  queueKey?: string;
  source?: string;
  startedAt?: string;
  status: "CANCELLED" | "COMPLETE" | "ERROR" | "PENDING" | "RUNNING";
  targetIds: string[];
  targetVersions?: Record<string, string>;
  totalCount: number;
  transformIds?: string[];
  transformOptions?: import("medior/server/database/actions/file-transforms").TransformQueueOptions;
  type:
    | "audioAnalysis"
    | "collectionMetadata"
    | "duplicateMerge"
    | "fileTagAncestors"
    | "mediaPathIndex"
    | "metadataAction"
    | "repair"
    | "tagHierarchy"
    | "tagMetadata"
    | "tagRefresh"
    | "transformQueue";
  work?: import("medior/server/database/metadata-work").MetadataWork;
}

const BackgroundOperationSchema = new Schema<BackgroundOperationSchema>({
  id: String,
  dateCreated: String,
  completedAt: String,
  dateModified: String,
  dismissedAt: String,
  error: String,
  failures: [{ message: String, targetId: String }],
  label: String,
  message: String,
  processedCount: Number,
  queueKey: String,
  source: String,
  startedAt: String,
  status: { type: String, enum: ["CANCELLED", "COMPLETE", "ERROR", "PENDING", "RUNNING"] },
  targetIds: [String],
  targetVersions: Schema.Types.Mixed,
  totalCount: Number,
  transformIds: [String],
  transformOptions: Schema.Types.Mixed,
  type: {
    type: String,
    enum: [
      "audioAnalysis",
      "collectionMetadata",
      "duplicateMerge",
      "fileTagAncestors",
      "mediaPathIndex",
      "metadataAction",
      "repair",
      "tagHierarchy",
      "tagMetadata",
      "tagRefresh",
      "transformQueue",
    ],
  },
  work: Schema.Types.Mixed,
});

BackgroundOperationSchema.plugin(backgroundExecutionPlugin);

BackgroundOperationSchema.index({ dateCreated: 1, _id: 1 }, { unique: true });
BackgroundOperationSchema.index(
  { queueKey: 1 },
  { unique: true, partialFilterExpression: { queueKey: { $type: "string" } } },
);
BackgroundOperationSchema.index({ type: 1, status: 1, _id: 1 }, { unique: false });

export const BackgroundOperationModel = model<BackgroundOperationSchema>(
  "BackgroundOperation",
  BackgroundOperationSchema,
);

/* --------------------------------------------------------------------------- */
/*                               DeletedFile
/* --------------------------------------------------------------------------- */

export interface DeletedFileSchema {
  dateCreated: string;
  hash: string;
  id: string;
}

const DeletedFileSchema = new Schema<DeletedFileSchema>({
  id: String,
  dateCreated: String,
  hash: String,
});

DeletedFileSchema.plugin(backgroundExecutionPlugin);

DeletedFileSchema.index({ hash: 1 }, { unique: true });

export const DeletedFileModel = model<DeletedFileSchema>("DeletedFile", DeletedFileSchema);

/* --------------------------------------------------------------------------- */
/*                               FileCollection
/* --------------------------------------------------------------------------- */

export interface FileCollectionSchema {
  dateCreated: string;
  dateModified: string;
  fileCount: number;
  fileIdIndexes: Array<{ fileId: string; index: number }>;
  id: string;
  rating: number;
  ratingIsManual?: boolean;
  size: number;
  sourceFolderKeys: string[];
  sourceFolderPaths: string[];
  tagIds: string[];
  tagIdsWithAncestors: string[];
  title: string;
}

const FileCollectionSchema = new Schema<FileCollectionSchema>({
  id: String,
  dateCreated: String,
  dateModified: String,
  fileCount: Number,
  fileIdIndexes: [{ fileId: Schema.Types.ObjectId, index: Number }],
  rating: Number,
  ratingIsManual: Boolean,
  size: Number,
  sourceFolderKeys: [String],
  sourceFolderPaths: [String],
  tagIds: [{ type: Schema.Types.ObjectId, ref: "Tag" }],
  tagIdsWithAncestors: [{ type: Schema.Types.ObjectId, ref: "Tag" }],
  title: String,
});

FileCollectionSchema.plugin(backgroundExecutionPlugin);

FileCollectionSchema.plugin(mediaAncestryPlugin);

FileCollectionSchema.index({ dateCreated: 1, _id: 1 }, { unique: true });
FileCollectionSchema.index({ dateModified: 1, _id: 1 }, { unique: true });
FileCollectionSchema.index({ fileCount: 1, _id: 1 }, { unique: true });
FileCollectionSchema.index({ "fileIdIndexes.fileId": 1 }, { unique: false });
FileCollectionSchema.index({ rating: 1, _id: 1 }, { unique: true });
FileCollectionSchema.index({ size: 1, _id: 1 }, { unique: true });
FileCollectionSchema.index({ sourceFolderKeys: 1 }, { unique: false });
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
  hash: string;
  name: string;
  path: string;
  size: number;
  status: string | "COMPLETE" | "DELETED" | "DUPLICATE" | "ERROR" | "PENDING";
  tagIds: string[];
  thumb: {
    frameHeight?: number;
    frameWidth?: number;
    ntfsFileId?: string;
    ntfsVolumeId?: string;
    path: string;
  };
}

export interface FileImportBatchSchema {
  collectionId?: string;
  collectionSourceFolderPath?: string;
  collectionTitle?: string;
  completedAt: string;
  dateCreated: string;
  deleteOnImport: boolean;
  fileCount: number;
  id: string;
  ignorePrevDeleted: boolean;
  imports?: FileImport[];
  isCompleted: boolean;
  rootFolderPath: string;
  size?: number;
  startedAt?: string;
  tagIds: string[];
  tagIdsWithAncestors: string[];
}

const FileImportBatchSchema = new Schema<FileImportBatchSchema>({
  id: String,
  dateCreated: String,
  collectionId: String,
  collectionSourceFolderPath: String,
  collectionTitle: String,
  completedAt: String,
  deleteOnImport: Boolean,
  fileCount: Number,
  ignorePrevDeleted: Boolean,
  imports: [
    {
      dateCreated: String,
      diffusionParams: String,
      errorMsg: String,
      extension: String,
      fileId: Schema.Types.ObjectId,
      hash: String,
      name: String,
      path: String,
      size: Number,
      status: { type: String, enum: ["COMPLETE", "DELETED", "DUPLICATE", "ERROR", "PENDING"] },
      tagIds: [{ type: Schema.Types.ObjectId, ref: "Tag" }],
      thumb: {
        frameHeight: Number,
        frameWidth: Number,
        ntfsFileId: String,
        ntfsVolumeId: String,
        path: String,
      },
    },
  ],
  isCompleted: Boolean,
  rootFolderPath: String,
  size: Number,
  startedAt: String,
  tagIds: [{ type: Schema.Types.ObjectId, ref: "Tag" }],
  tagIdsWithAncestors: [{ type: Schema.Types.ObjectId, ref: "Tag" }],
});

FileImportBatchSchema.plugin(backgroundExecutionPlugin);

FileImportBatchSchema.plugin(mediaAncestryPlugin);

FileImportBatchSchema.index({ dateCreated: 1, _id: 1 }, { unique: true });
FileImportBatchSchema.index({ collectionTitle: 1, _id: 1 }, { unique: true });
FileImportBatchSchema.index({ completedAt: 1, _id: 1 }, { unique: true });
FileImportBatchSchema.index({ fileCount: 1, _id: 1 }, { unique: true });
FileImportBatchSchema.index({ isCompleted: 1, _id: 1 }, { unique: true });
FileImportBatchSchema.index({ rootFolderPath: 1, _id: 1 }, { unique: true });
FileImportBatchSchema.index({ size: 1, _id: 1 }, { unique: true });
FileImportBatchSchema.index({ startedAt: 1, _id: 1 }, { unique: true });
FileImportBatchSchema.index({ tagIds: 1, _id: 1 }, { unique: true });
FileImportBatchSchema.index({ tagIdsWithAncestors: 1, _id: 1 }, { unique: true });

export const FileImportBatchModel = model<FileImportBatchSchema>(
  "FileImportBatch",
  FileImportBatchSchema,
);

/* --------------------------------------------------------------------------- */
/*                               FileTransform
/* --------------------------------------------------------------------------- */

export interface FileTransformSchema {
  afterAudioBitrate?: number;
  afterAudioCodec?: string;
  afterBitrate?: number;
  afterDuration?: number;
  afterExt?: string;
  afterFrameRate?: number;
  afterHash?: string;
  afterHeight?: number;
  afterPath?: string;
  afterSize?: number;
  afterVideoCodec?: string;
  afterWidth?: number;
  beforeAudioBitrate?: number;
  beforeAudioCodec?: string;
  beforeBitrate?: number;
  beforeDuration?: number;
  beforeExt: string;
  beforeFrameRate?: number;
  beforeHash?: string;
  beforeHeight?: number;
  beforePath: string;
  beforeSize: number;
  beforeVideoCodec?: string;
  beforeWidth?: number;
  cleanupPending?: boolean;
  completedAt?: string;
  configCodec?: string;
  configImageExt?: string;
  configImageMaxHeight?: number;
  configImageMaxWidth?: number;
  configMaxBitrate?: number;
  configMaxFps?: number;
  configMaxHeight?: number;
  configMaxWidth?: number;
  configOverride?: string[];
  dateCreated: string;
  duplicateFileId?: string;
  duplicatePath?: string;
  errorMsg?: string;
  fileId: string;
  finalizationPending?: boolean;
  id: string;
  isCompleted: boolean;
  outputTempPath?: string;
  progressPercent?: number;
  progressSize?: number;
  progressTime?: string;
  queueIndex?: number;
  regenerationPending?: boolean;
  regenerationTagIds?: string[];
  startedAt?: string;
  status:
    | string
    | "COMPLETE"
    | "COMPRESSED"
    | "DUPLICATE"
    | "ERROR"
    | "MERGED"
    | "PENDING"
    | "REPLACED"
    | "RUNNING"
    | "SAVED"
    | "SKIPPED";
  timestampPairs?: Array<{ end: number; start: number }>;
  type: string | "reencode" | "remux" | "splice";
}

const FileTransformSchema = new Schema<FileTransformSchema>({
  id: String,
  dateCreated: String,
  afterAudioBitrate: Number,
  afterAudioCodec: String,
  afterBitrate: Number,
  afterDuration: Number,
  afterFrameRate: Number,
  afterHash: String,
  afterHeight: Number,
  afterPath: String,
  afterSize: Number,
  afterExt: String,
  afterVideoCodec: String,
  afterWidth: Number,
  beforeAudioBitrate: Number,
  beforeAudioCodec: String,
  beforeBitrate: Number,
  beforeDuration: Number,
  beforeFrameRate: Number,
  beforeHash: String,
  beforeHeight: Number,
  beforePath: String,
  beforeSize: Number,
  beforeExt: String,
  beforeVideoCodec: String,
  beforeWidth: Number,
  cleanupPending: Boolean,
  completedAt: String,
  configCodec: String,
  configImageExt: String,
  configImageMaxHeight: Number,
  configImageMaxWidth: Number,
  configMaxBitrate: Number,
  configMaxFps: Number,
  configMaxHeight: Number,
  configMaxWidth: Number,
  configOverride: [String],
  errorMsg: String,
  duplicateFileId: Schema.Types.ObjectId,
  duplicatePath: String,
  fileId: Schema.Types.ObjectId,
  finalizationPending: Boolean,
  isCompleted: Boolean,
  outputTempPath: String,
  progressPercent: Number,
  progressSize: Number,
  progressTime: String,
  queueIndex: Number,
  regenerationPending: Boolean,
  regenerationTagIds: [{ type: Schema.Types.ObjectId, ref: "Tag" }],
  startedAt: String,
  status: {
    type: String,
    enum: [
      "COMPLETE",
      "COMPRESSED",
      "DUPLICATE",
      "ERROR",
      "MERGED",
      "PENDING",
      "REPLACED",
      "RUNNING",
      "SAVED",
      "SKIPPED",
    ],
  },
  timestampPairs: [{ end: Number, start: Number }],
  type: { type: String, enum: ["reencode", "remux", "splice"] },
});

FileTransformSchema.plugin(backgroundExecutionPlugin);
FileTransformSchema.plugin(mediaPathPlugin, { modelName: "FileTransform" });

FileTransformSchema.index({ dateCreated: 1, _id: 1 }, { unique: true });
FileTransformSchema.index(
  { isCompleted: 1, status: 1, dateCreated: 1, queueIndex: 1, _id: 1 },
  { unique: true },
);
FileTransformSchema.index({ cleanupPending: 1 }, { unique: false });
FileTransformSchema.index({ completedAt: 1, _id: 1 }, { unique: false });
FileTransformSchema.index({ fileId: 1, _id: 1 }, { unique: false });
FileTransformSchema.index({ finalizationPending: 1 }, { unique: false });
FileTransformSchema.index({ isCompleted: 1, _id: 1 }, { unique: false });
FileTransformSchema.index(
  { outputTempPath: 1 },
  { partialFilterExpression: { outputTempPath: { $type: "string" } }, unique: false },
);
FileTransformSchema.index({ regenerationPending: 1 }, { unique: false });
FileTransformSchema.index({ startedAt: 1, _id: 1 }, { unique: false });
FileTransformSchema.index({ status: 1, _id: 1 }, { unique: false });
FileTransformSchema.index({ type: 1, _id: 1 }, { unique: false });

export const FileTransformModel = model<FileTransformSchema>("FileTransform", FileTransformSchema);

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
  audioBitrate?: number;
  audioCodec?: string;
  bitrate?: number;
  collectionIds: string[];
  dateCreated: string;
  dateImported: string;
  dateModified: string;
  diffusionParams?: string;
  duration?: number;
  ext: string;
  faceModels?: FaceModel[];
  frameRate?: number;
  hash: string;
  hasTranscript: boolean;
  height: number;
  id: string;
  isArchived?: boolean;
  isCorrupted?: boolean;
  originalAudioBitrate?: number;
  originalAudioCodec?: string;
  originalBitrate?: number;
  originalHash?: string;
  originalName?: string;
  originalPath: string;
  originalSize: number;
  originalVideoCodec?: string;
  path: string;
  peakDecibels?: number;
  rating: number;
  size: number;
  tagIds: string[];
  tagIdsWithAncestors: string[];
  thumb: {
    frameHeight?: number;
    frameWidth?: number;
    ntfsFileId?: string;
    ntfsVolumeId?: string;
    path: string;
  };
  timestamps?: Array<{
    id: string;
    label: string;
    pairs: Array<{
      endDuration: string;
      id: string;
      order: number;
      startDuration: string;
    }>;
  }>;
  transcription?: { segments: Array<{ end: number; start: number; text: string }>; text: string };
  videoCodec?: string;
  waveformPeaks?: number[];
  width: number;
}

const FileSchema = new Schema<FileSchema>({
  id: String,
  dateCreated: String,
  audioBitrate: Number,
  audioCodec: String,
  bitrate: Number,
  collectionIds: [{ type: Schema.Types.ObjectId, ref: "FileCollection" }],
  dateImported: String,
  dateModified: String,
  diffusionParams: String,
  duration: Number,
  ext: String,
  faceModels: [
    {
      box: { height: Number, width: Number, x: Number, y: Number },
      descriptors: [Object],
      fileId: Schema.Types.ObjectId,
      tagId: Schema.Types.ObjectId,
    },
  ],
  frameRate: Number,
  hash: String,
  hasTranscript: Boolean,
  height: Number,
  isArchived: Boolean,
  isCorrupted: Boolean,
  originalAudioBitrate: Number,
  originalAudioCodec: String,
  originalBitrate: Number,
  originalHash: String,
  originalName: String,
  originalPath: String,
  originalSize: Number,
  originalVideoCodec: String,
  path: String,
  peakDecibels: Number,
  rating: Number,
  size: Number,
  tagIds: [{ type: Schema.Types.ObjectId, ref: "Tag" }],
  tagIdsWithAncestors: [{ type: Schema.Types.ObjectId, ref: "Tag" }],
  thumb: {
    frameHeight: Number,
    frameWidth: Number,
    ntfsFileId: String,
    ntfsVolumeId: String,
    path: String,
  },
  timestamps: [
    {
      id: String,
      label: String,
      order: Number,
      pairs: [{ endDuration: String, id: String, order: Number, startDuration: String }],
    },
  ],
  transcription: { segments: [{ end: Number, start: Number, text: String }], text: String },
  videoCodec: String,
  waveformPeaks: [Number],
  width: Number,
});

FileSchema.plugin(backgroundExecutionPlugin);
FileSchema.plugin(mediaPathPlugin, { modelName: "File" });
FileSchema.plugin(mediaAncestryPlugin);

FileSchema.index({ dateCreated: 1, _id: 1 }, { unique: true });
FileSchema.index({ audioCodec: 1 }, { unique: false });
FileSchema.index({ bitrate: 1, _id: 1 }, { unique: true });
FileSchema.index({ collectionIds: 1 }, { unique: false });
FileSchema.index({ dateImported: 1, _id: 1 }, { unique: true });
FileSchema.index({ dateModified: 1, _id: 1 }, { unique: true });
FileSchema.index({ duration: 1, _id: 1 }, { unique: true });
FileSchema.index({ ext: 1 }, { unique: false });
FileSchema.index({ hash: 1 }, { unique: true });
FileSchema.index({ hasTranscript: 1 }, { unique: false });
FileSchema.index({ height: 1, _id: 1 }, { unique: true });
FileSchema.index({ isArchived: 1 }, { unique: false });
FileSchema.index({ isCorrupted: 1 }, { unique: false });
FileSchema.index({ originalName: 1, _id: 1 }, { unique: true });
FileSchema.index({ peakDecibels: 1, _id: 1 }, { unique: true });
FileSchema.index({ rating: 1, _id: 1 }, { unique: true });
FileSchema.index({ size: 1, _id: 1 }, { unique: true });
FileSchema.index({ tagIds: 1 }, { unique: false });
FileSchema.index({ tagIdsWithAncestors: 1 }, { unique: false });
FileSchema.index({ videoCodec: 1 }, { unique: false });
FileSchema.index({ width: 1, _id: 1 }, { unique: true });

export const FileModel = model<FileSchema>("File", FileSchema);

/* --------------------------------------------------------------------------- */
/*                               Notification
/* --------------------------------------------------------------------------- */

export interface NotificationSchema {
  dateCreated: string;
  id: string;
  isRead: boolean;
  message: string;
  type: "error" | "info" | "success" | "warning";
}

const NotificationSchema = new Schema<NotificationSchema>({
  id: String,
  dateCreated: String,
  isRead: Boolean,
  message: String,
  type: { type: String, enum: ["error", "info", "success", "warning"] },
});

NotificationSchema.plugin(backgroundExecutionPlugin);

NotificationSchema.index({ dateCreated: 1, _id: 1 }, { unique: true });

export const NotificationModel = model<NotificationSchema>("Notification", NotificationSchema);

/* --------------------------------------------------------------------------- */
/*                               SavedImportConfig
/* --------------------------------------------------------------------------- */

export interface SavedImportConfigSchema {
  dateCreated: string;
  dateModified?: string;
  folderPath: string;
  id: string;
  label: string;
  options: Record<string, any>;
}

const SavedImportConfigSchema = new Schema<SavedImportConfigSchema>({
  id: String,
  dateCreated: String,
  dateModified: String,
  folderPath: String,
  label: String,
  options: Object,
});

SavedImportConfigSchema.plugin(backgroundExecutionPlugin);

SavedImportConfigSchema.index({ dateCreated: 1, _id: 1 }, { unique: true });
SavedImportConfigSchema.index({ dateModified: 1, _id: 1 }, { unique: true });
SavedImportConfigSchema.index({ folderPath: 1 }, { unique: true });

export const SavedImportConfigModel = model<SavedImportConfigSchema>(
  "SavedImportConfig",
  SavedImportConfigSchema,
);

/* --------------------------------------------------------------------------- */
/*                               SavedSearch
/* --------------------------------------------------------------------------- */

export interface SavedSearchSchema {
  dateCreated: string;
  filterProps: Record<string, any>;
  id: string;
  label: string;
  searchType: string;
}

const SavedSearchSchema = new Schema<SavedSearchSchema>({
  id: String,
  dateCreated: String,
  filterProps: Object,
  label: String,
  searchType: String,
});

SavedSearchSchema.plugin(backgroundExecutionPlugin);

SavedSearchSchema.index({ dateCreated: 1, _id: 1 }, { unique: true });
SavedSearchSchema.index({ searchType: 1, label: 1 }, { unique: true });

export const SavedSearchModel = model<SavedSearchSchema>("SavedSearch", SavedSearchSchema);

/* --------------------------------------------------------------------------- */
/*                               Tag
/* --------------------------------------------------------------------------- */

export interface TagSchema {
  aliases: string[];
  ancestorIds: string[];
  category?: {
    color: CssColor | null;
    icon: IconName | null;
    inheritable: boolean;
    sortRank: number | null;
  };
  childIds: string[];
  count: number;
  dateCreated: string;
  dateModified: string;
  dateOfInception?: string;
  descendantIds: string[];
  id: string;
  label: string;
  lastSearchedAt?: string;
  parentIds: string[];
  rating: number;
  ratingIsManual?: boolean;
  regEx?: string;
  size: number;
  thumb: { frameHeight?: number; frameWidth?: number; path: string };
}

const TagSchema = new Schema<TagSchema>({
  id: String,
  dateCreated: String,
  aliases: [String],
  ancestorIds: [{ type: Schema.Types.ObjectId, ref: "Tag" }],
  category: {
    color: String,
    icon: String,
    inheritable: Boolean,
    sortRank: Number,
  },
  childIds: [{ type: Schema.Types.ObjectId, ref: "Tag" }],
  count: Number,
  dateModified: String,
  dateOfInception: String,
  descendantIds: [{ type: Schema.Types.ObjectId, ref: "Tag" }],
  label: String,
  lastSearchedAt: String,
  parentIds: [{ type: Schema.Types.ObjectId, ref: "Tag" }],
  rating: Number,
  ratingIsManual: Boolean,
  regEx: String,
  size: Number,
  thumb: { frameHeight: Number, frameWidth: Number, path: String },
});

TagSchema.plugin(backgroundExecutionPlugin);
TagSchema.plugin(mediaPathPlugin, { modelName: "Tag" });
TagSchema.plugin(tagAncestryPlugin);

TagSchema.index({ dateCreated: 1, _id: 1 }, { unique: true });
TagSchema.index({ childIds: 1 }, { unique: false });
TagSchema.index({ dateOfInception: 1, _id: 1 }, { unique: true });
TagSchema.index({ label: 1 }, { unique: true });
TagSchema.index({ parentIds: 1 }, { unique: false });
TagSchema.index({ rating: 1, _id: 1 }, { unique: true });

export const TagModel = model<TagSchema>("Tag", TagSchema);
