import { model, Schema } from "mongoose";

export type RegExMapType = "diffusionParams" | "fileName" | "folderName";

export interface RegExMap {
  id: string;
  regEx: string;
  tagId: string;
  testString?: string;
  types: RegExMapType[];
}

const RegExMapSchema = new Schema<RegExMap>({
  regEx: String,
  tagId: Schema.Types.ObjectId,
  testString: String,
  types: [String],
});

export const RegExMapModel = model<RegExMap>("RegExMap", RegExMapSchema);
