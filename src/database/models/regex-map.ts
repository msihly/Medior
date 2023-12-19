import { model, Schema } from "mongoose";

export interface RegExMap {
  id: string;
  regEx: string;
  tagIds?: string[];
  testString?: string;
  title?: string;
  type: "diffusionToTags" | "fileToTags" | "folderToCollection" | "folderToTags";
}

const RegExMapSchema = new Schema<RegExMap>({
  regEx: String,
  tagIds: [Schema.Types.ObjectId],
  testString: String,
  title: String,
  type: String,
});

export const RegExMapModel = model<RegExMap>("RegExMap", RegExMapSchema);
