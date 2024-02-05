import { model, Schema } from "mongoose";

export type RegExMapType = "diffusionParams" | "fileName" | "folderName";

export interface RegExMap {
  regEx: string;
  testString?: string;
  types: RegExMapType[];
}

export interface Tag {
  aliases: string[];
  childIds: string[];
  count: number;
  dateCreated: string;
  dateModified: string;
  id: string;
  label: string;
  parentIds: string[];
  regExMap: RegExMap;
}

const RegExMapSchema = new Schema<RegExMap>({
  regEx: String,
  testString: String,
  types: [String],
});

const TagSchema = new Schema<Tag>({
  aliases: [String],
  childIds: [{ type: Schema.Types.ObjectId, ref: "Tag" }],
  count: Number,
  dateCreated: String,
  dateModified: String,
  label: String,
  parentIds: [{ type: Schema.Types.ObjectId, ref: "Tag" }],
  regExMap: RegExMapSchema,
});

export const TagModel = model<Tag>("Tag", TagSchema);
