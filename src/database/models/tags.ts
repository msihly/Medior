import { model, Schema } from "mongoose";

export interface Tag {
  aliases: string[];
  id: string;
  label: string;
  parentIds: string[];
}

const TagSchema = new Schema<Tag>({
  aliases: [String],
  label: String,
  parentIds: [String],
});

TagSchema.set("toJSON", { virtuals: true });

export const TagModel = model<Tag>("Tag", TagSchema);
