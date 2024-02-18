import { model, Schema } from "mongoose";

export interface DeletedFile {
  hash: string;
  id: string;
}

const DeletedFileSchema = new Schema<DeletedFile>({
  hash: String,
});

DeletedFileSchema.index({ hash: 1 }, { unique: true });

export const DeletedFileModel = model<DeletedFile>("DeletedFile", DeletedFileSchema);
