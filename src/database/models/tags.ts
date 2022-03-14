import { model, Schema } from "mongoose";

interface Tag {
  aliases: string[];
  label: string;
  parentIds: string[];
}

const TagSchema = new Schema<Tag>({
  aliases: [String],
  label: String,
  parentIds: [String],
});

TagSchema.set("toJSON", { virtuals: true });

const TagModel = model<Tag>("Tag", TagSchema);

export default TagModel;

// files have array of tag ids
// tag id => label is handled via MST views
// aliasIds are used to match tags that mean the same thing
// parentIds are used for searching to match any files that include searched tagIds in their parentIds
