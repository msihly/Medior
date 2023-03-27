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
  childIds: [String],
  count: Number,
  hidden: Boolean,
  label: String,
  parentIds: [String],
});

TagSchema.set("toJSON", {
  transform: (_, ret) => {
    delete ret._id;
    delete ret.__v;
  },
  virtuals: true,
});

export const TagModel = model<Tag>("Tag", TagSchema);
