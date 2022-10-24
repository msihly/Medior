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

FileCollectionSchema.set("toJSON", {
  transform: (_, ret) => {
    delete ret._id;
    delete ret.__v;
  },
  virtuals: true,
});

export const FileCollectionModel = model<FileCollection>("FileCollection", FileCollectionSchema);
