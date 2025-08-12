import { ModelDb } from "medior/generator/schema/generators";

const model = new ModelDb("File", { withStore: true });

model.addIndex({ bitrate: 1, _id: 1 });
model.addProp("bitrate", "number", { sort: { icon: "DataThresholding", label: "Bitrate" } });

model.addIndex({ dateModified: 1, _id: 1 });
model.addProp("dateModified", "string", {
  required: true,
  sort: { icon: "DateRange", label: "Date Modified" },
});

model.addProp("diffusionParams", "string");

model.addIndex({ duration: 1, _id: 1 });
model.addProp("duration", "number", { sort: { icon: "HourglassBottom", label: "Duration" } });

model.addIndex({ ext: 1, _id: 1 });
model.addProp("ext", "string", { required: true });

model.addProp("faceModels", "FaceModel[]", {
  excludeFromStore: true,
  schemaType: [
    model.makeProp("box", "{ height: number; width: number; x: number; y: number }", {
      schemaType: "{ height: Number, width: Number, x: Number, y: Number }",
    }),
    model.makeProp("descriptors", "string", { schemaType: "[Object]" }),
    model.makeProp("fileId", "File.id"),
    model.makeProp("tagId", "Tag.id"),
  ],
  storeType: "db.FaceModel[]",
  typeName: "FaceModel",
});

model.addProp("frameRate", "number");

model.addIndex({ hash: 1 });
model.addProp("hash", "string", { required: true });

model.addIndex({ height: 1, _id: 1 });
model.addProp("height", "number", { required: true, sort: { icon: "Height", label: "Height" } });

model.addIndex({ isArchived: 1, ext: 1, tagIds: 1, _id: 1 });
model.addIndex({ isArchived: 1, ext: 1, tagIdsWithAncestors: 1, _id: 1 });
model.addProp("isArchived", "boolean");

model.addIndex({ isCorrupted: 1, _id: 1 });
model.addProp("isCorrupted", "boolean");

model.addProp("originalBitrate", "number");

model.addIndex({ originalHash: 1, _id: 1 });
model.addProp("originalHash", "string");

model.addProp("originalName", "string");

model.addIndex({ originalPath: 1, _id: 1 });
model.addProp("originalPath", "string", { required: true });

model.addProp("originalSize", "number", { required: true });

model.addProp("originalVideoCodec", "string");

model.addIndex({ path: 1, _id: 1 });
model.addProp("path", "string", { required: true });

model.addIndex({ rating: 1, _id: 1 });
model.addProp("rating", "number", { required: true, sort: { icon: "Star", label: "Rating" } });

model.addIndex({ size: 1, _id: 1 });
model.addProp("size", "number", { required: true, sort: { icon: "FormatSize", label: "Size" } });

model.addIndex({ tagIds: 1, _id: 1 });
model.addProp("tagIds", "Tag.id[]", { required: true });

model.addIndex({ tagIdsWithAncestors: 1, _id: 1 });
model.addProp("tagIdsWithAncestors", "Tag.id[]", { required: true });

model.addProp("thumb", "{ frameHeight?: number; frameWidth?: number; path: string }", {
  required: true,
  schemaType: "{ frameHeight: Number, frameWidth: Number, path: String }",
});

model.addProp("videoCodec", "string");

model.addIndex({ width: 1, _id: 1 });
model.addProp("width", "number", {
  required: true,
  sort: { icon: "Height", label: "Width", iconProps: { rotation: 90 } },
});

export const MODEL_FILE = model.getModel();
