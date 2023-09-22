import { model, Schema } from "mongoose";

type FileImportStatus = "COMPLETE" | "DUPLICATE" | "ERROR" | "PENDING";

export interface FileImport {
  dateCreated: string;
  errorMsg?: string;
  extension: string;
  fileId?: string;
  name: string;
  path: string;
  size: number;
  status: FileImportStatus | string;
}

export interface FileImportBatch {
  createdAt: string;
  completedAt: string;
  id: string;
  imports: FileImport[];
  startedAt: string;
  tagIds: string[];
}

const FileImportBatchSchema = new Schema<FileImportBatch>({
  createdAt: String,
  completedAt: String,
  imports: [
    {
      dateCreated: String,
      errorMsg: String,
      extension: String,
      fileId: { type: Schema.Types.ObjectId, ref: "File" },
      name: String,
      path: String,
      size: Number,
      status: {
        type: String,
        enum: ["COMPLETE", "DUPLICATE", "ERROR", "PENDING"],
      },
    },
  ],
  startedAt: String,
  tagIds: [[{ type: Schema.Types.ObjectId, ref: "Tag" }]],
});

FileImportBatchSchema.index({ createdAt: 1 });

export const FileImportBatchModel = model<FileImportBatch>(
  "FileImportBatch",
  FileImportBatchSchema
);
