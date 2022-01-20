import { model, Schema } from "mongoose";

interface File {
  dateCreated: string;
  dateModified: string;
  ext: string;
  hash: string;
  isArchived: boolean;
  originalName?: string;
  originalPath: string;
  path: string;
  size: number;
  tags: string[];
  thumbPath: string;
}

const FileSchema = new Schema<File>({
  dateCreated: String,
  dateModified: String,
  ext: String,
  hash: String,
  isArchived: Boolean,
  originalName: String,
  originalPath: String,
  path: String,
  size: Number,
  tags: [String],
  thumbPath: String,
});

FileSchema.set("toJSON", { virtuals: true });

const FileModel = model<File>("File", FileSchema);

export default FileModel;
