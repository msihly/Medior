import { model, Schema } from "mongoose";

export interface Tag {
  aliases: string[];
  childIds: string[];
  count: number;
  hidden: boolean;
  id: string;
  label: string;
  parentIds: string[];
}

const TagSchema = new Schema<Tag>({
  aliases: [String],
  childIds: [{ type: Schema.Types.ObjectId, ref: "Tag" }],
  count: Number,
  hidden: Boolean,
  label: String,
  parentIds: [{ type: Schema.Types.ObjectId, ref: "Tag" }],
});

export const TagModel = model<Tag>("Tag", TagSchema);
