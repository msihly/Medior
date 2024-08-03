import { model, Schema } from "mongoose";

type FileImportStatus = "COMPLETE" | "DELETED" | "DUPLICATE" | "ERROR" | "PENDING";

export interface FileImport {
  dateCreated: string;
  diffusionParams?: string;
  errorMsg?: string;
  extension: string;
  fileId?: string;
  name: string;
  path: string;
  size: number;
  status: FileImportStatus | string;
  tagIds?: string[];
  thumbPaths?: string[];
}

export interface FileImportBatch {
  collectionId?: string;
  collectionTitle?: string;
  completedAt: string;
  createdAt: string;
  deleteOnImport: boolean;
  id: string;
  ignorePrevDeleted: boolean;
  imports: FileImport[];
  rootFolderPath: string;
  startedAt: string;
  tagIds: string[];
}

const FileImportBatchSchema = new Schema<FileImportBatch>({
  collectionId: String,
  collectionTitle: String,
  completedAt: String,
  createdAt: String,
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
      status: {
        type: String,
        enum: ["COMPLETE", "DELETED", "DUPLICATE", "ERROR", "PENDING"],
      },
      tagIds: [{ type: Schema.Types.ObjectId, ref: "Tag" }],
      thumbPaths: [String],
    },
  ],
  rootFolderPath: String,
  startedAt: String,
  tagIds: [[{ type: Schema.Types.ObjectId, ref: "Tag" }]],
});

FileImportBatchSchema.index({ createdAt: 1 });

export const FileImportBatchModel = model<FileImportBatch>(
  "FileImportBatch",
  FileImportBatchSchema
);
