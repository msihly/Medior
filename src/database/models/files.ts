import { model, Schema } from "mongoose";

export interface File {
  // collections: { collectionId: string; manualIndex: number }[];
  dateCreated: string;
  dateModified: string;
  ext: string;
  hash: string;
  id: string;
  isArchived: boolean;
  originalName?: string;
  originalPath: string;
  path: string;
  rating: number;
  size: number;
  tagIds: string[];
  thumbPaths: string[];
}

const FileSchema = new Schema<File>({
  // collections: [{ collectionId: String, manualIndex: number }],
  dateCreated: String,
  dateModified: String,
  ext: String,
  hash: String,
  isArchived: Boolean,
  originalName: String,
  originalPath: String,
  path: String,
  rating: Number,
  size: Number,
  tagIds: [String],
  thumbPaths: [String],
});

FileSchema.set("toJSON", { virtuals: true });

export const FileModel = model<File>("File", FileSchema);
