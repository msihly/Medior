import { model, Schema } from "mongoose";

export interface Tag {
  aliases: string[];
  childIds: string[];
  count: number;
  dateCreated: string;
  dateModified: string;
  id: string;
  label: string;
  parentIds: string[];
}

const TagSchema = new Schema<Tag>({
  aliases: [String],
  childIds: [{ type: Schema.Types.ObjectId, ref: "Tag" }],
  count: Number,
  dateCreated: String,
  dateModified: String,
  label: String,
  parentIds: [{ type: Schema.Types.ObjectId, ref: "Tag" }],
});

export const TagModel = model<Tag>("Tag", TagSchema);
