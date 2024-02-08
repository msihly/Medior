import { model, Schema } from "mongoose";

export interface File {
  dateCreated: string;
  dateModified: string;
  diffusionParams?: string;
  faceModels?: {
    box: { height: number; width: number; x: number; y: number };
    /** JSON representation of Float32Array[] */
    descriptors: string;
    fileId: string;
    tagId: string;
  }[];
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
  diffusionParams: String,
  duration: Number,
  ext: String,
  faceModels: [
    {
      box: { height: Number, width: Number, x: Number, y: Number },
      descriptors: [Object],
      fileId: Schema.Types.ObjectId,
      tagId: Schema.Types.ObjectId,
    },
  ],
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
  tagIds: [{ type: Schema.Types.ObjectId, ref: "Tag" }],
  thumbPaths: [String],
  width: Number,
});

FileSchema.index({ hash: 1 }, { unique: true });
FileSchema.index({ isArchived: 1, ext: 1, tagIds: 1, _id: 1 }, { unique: true });
FileSchema.index({ tagIds: 1, _id: 1 }, { unique: true });

FileSchema.index({ dateCreated: 1, _id: 1 }, { unique: true });
FileSchema.index({ dateModified: 1, _id: 1 }, { unique: true });
FileSchema.index({ duration: 1, _id: 1 }, { unique: true });
FileSchema.index({ height: 1, _id: 1 }, { unique: true });
FileSchema.index({ rating: 1, _id: 1 }, { unique: true });
FileSchema.index({ size: 1, _id: 1 }, { unique: true });
FileSchema.index({ width: 1, _id: 1 }, { unique: true });

export const FileModel = model<File>("File", FileSchema);
