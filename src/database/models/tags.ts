import { model, Schema } from "mongoose";

export type RegExMapType = "diffusionParams" | "fileName" | "folderName";

export interface RegExMap {
  regEx: string;
  testString?: string;
  types: RegExMapType[];
}

export interface Tag {
  aliases: string[];
  ancestorIds: string[];
  childIds: string[];
  count: number;
  dateCreated: string;
  dateModified: string;
  descendantIds: string[];
  id: string;
  label: string;
  parentIds: string[];
  regExMap: RegExMap;
  thumbPaths: string[];
}

const RegExMapSchema = new Schema<RegExMap>({
  regEx: String,
  testString: String,
  types: [String],
});

const TagSchema = new Schema<Tag>({
  aliases: [String],
  ancestorIds: [{ type: Schema.Types.ObjectId, ref: "Tag" }],
  childIds: [{ type: Schema.Types.ObjectId, ref: "Tag" }],
  count: Number,
  dateCreated: String,
  dateModified: String,
  descendantIds: [{ type: Schema.Types.ObjectId, ref: "Tag" }],
  label: String,
  parentIds: [{ type: Schema.Types.ObjectId, ref: "Tag" }],
  regExMap: RegExMapSchema,
  thumbPaths: [String],
});

export const TagModel = model<Tag>("Tag", TagSchema);
