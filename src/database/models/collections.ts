import { model, Schema } from "mongoose";

interface FileIdIndex {
  fileId: string;
  index: number;
}

export interface FileCollection {
  dateCreated: string;
  dateModified: string;
  fileCount: number;
  fileIdIndexes: FileIdIndex[];
  id: string;
  rating: number;
  tagIds: string[];
  tagIdsWithAncestors: string[];
  thumbPaths: string[];
  title: string;
}

const FileCollectionSchema = new Schema<FileCollection>({
  dateCreated: String,
  dateModified: String,
  fileCount: Number,
  fileIdIndexes: [{ fileId: Schema.Types.ObjectId, index: Number }],
  rating: Number,
  tagIds: [{ type: Schema.Types.ObjectId, ref: "Tag" }],
  tagIdsWithAncestors: [{ type: Schema.Types.ObjectId, ref: "Tag" }],
  thumbPaths: [String],
  title: String,
});

FileCollectionSchema.index({ tagIds: 1, _id: 1 }, { unique: true });
FileCollectionSchema.index({ tagIdsWithAncestors: 1, _id: 1 }, { unique: true });
FileCollectionSchema.index({ tagIds: 1, tagIdsWithAncestors: 1, _id: 1 }, { unique: true });

FileCollectionSchema.index({ dateCreated: 1, _id: 1 }, { unique: true });
FileCollectionSchema.index({ dateModified: 1, _id: 1 }, { unique: true });
FileCollectionSchema.index({ fileCount: 1, _id: 1 }, { unique: true });
FileCollectionSchema.index({ rating: 1, _id: 1 }, { unique: true });
FileCollectionSchema.index({ title: 1, _id: 1 }, { unique: true });

export const FileCollectionModel = model<FileCollection>("FileCollection", FileCollectionSchema);
