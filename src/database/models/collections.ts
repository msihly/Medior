import { model, Schema } from "mongoose";

interface File {
  fileId: string;
  index: number;
}

export interface FileCollection {
  fileIndexes: File[];
  title: string;
}

const FileCollectionSchema = new Schema<FileCollection>({});

FileCollectionSchema.set("toJSON", { virtuals: true });

export const FileCollectionModel = model<FileCollection>("FileCollection", FileCollectionSchema);
