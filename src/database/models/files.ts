import { model, Schema } from "mongoose";

export interface File {
  dateCreated: string;
  dateModified: string;
  duration?: number;
  ext: string;
  frameRate: number;
  hash: string;
  height: number;
  id: string;
  isArchived: boolean;
  originalName?: string;
  originalPath: string;
  path: string;
  rating: number;
  size: number;
  tagIds: string[];
  thumbPaths: string[];
  width: number;
}

const FileSchema = new Schema<File>({
  dateCreated: String,
  dateModified: String,
  duration: Number,
  ext: String,
  frameRate: Number,
  hash: String,
  height: Number,
  isArchived: Boolean,
  originalName: String,
  originalPath: String,
  path: String,
  rating: Number,
  size: Number,
  tagIds: [String],
  thumbPaths: [String],
  width: Number,
});

FileSchema.index({ hash: 1 });

FileSchema.set("toJSON", { virtuals: true });

export const FileModel = model<File>("File", FileSchema);
