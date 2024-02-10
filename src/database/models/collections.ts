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
  thumbPaths: string[];
  title: string;
}

const FileCollectionSchema = new Schema<FileCollection>({
  dateCreated: String,
  dateModified: String,
  fileCount: Number,
  fileIdIndexes: [{ fileId: Schema.Types.ObjectId, index: Number }],
  rating: Number,
  tagIds: [Schema.Types.ObjectId],
  thumbPaths: [String],
  title: String,
});

export const FileCollectionModel = model<FileCollection>("FileCollection", FileCollectionSchema);
