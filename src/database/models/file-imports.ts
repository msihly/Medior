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
      fileId: String,
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
  tagIds: [String],
});

FileImportBatchSchema.index({ createdAt: 1 });

FileImportBatchSchema.set("toJSON", {
  transform: (_, ret) => {
    delete ret._id;
    delete ret.__v;
    ret.imports.forEach((imp) => delete imp._id);
  },
  virtuals: true,
});

export const FileImportBatchModel = model<FileImportBatch>(
  "FileImportBatch",
  FileImportBatchSchema
);
