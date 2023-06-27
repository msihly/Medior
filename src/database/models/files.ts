import { model, Schema } from "mongoose";
// import { logToFile } from "utils";

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
  originalHash?: string;
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
  originalHash: String,
  originalName: String,
  originalPath: String,
  path: String,
  rating: Number,
  size: Number,
  tagIds: [String],
  thumbPaths: [String],
  width: Number,
});

FileSchema.index({ hash: 1 }, { unique: true });
FileSchema.index({ isArchived: 1, ext: 1, tagIds: 1 });
FileSchema.index({ tagIds: 1 });

// let startTime: number = null;

// FileSchema.pre("find", () => {
//   startTime = Date.now();
// });

// FileSchema.post("find", () => {
//   if (startTime !== null) logToFile("debug", `Mongo find Files: ${Date.now() - startTime}ms.`);
// });

FileSchema.set("toJSON", {
  transform: (_, ret) => {
    delete ret._id;
    delete ret.__v;
  },
  virtuals: true,
});

export const FileModel = model<File>("File", FileSchema);
