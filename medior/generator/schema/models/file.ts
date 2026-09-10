import { ModelDb } from "medior/generator/schema/generators";

const model = new ModelDb("File", { withStore: true });

model.addProp("audioBitrate", "number");

model.addIndex({ audioCodec: 1 }, { unique: false });
model.addProp("audioCodec", "string");

model.addIndex({ bitrate: 1, _id: 1 });
model.addProp("bitrate", "number", { sort: { icon: "DataThresholding", label: "Bitrate" } });

model.addIndex({ collectionIds: 1 }, { unique: false });
model.addProp("collectionIds", "FileCollection.id[]", { defaultValue: "[]", required: true });

model.addIndex({ dateImported: 1, _id: 1 });
model.addProp("dateImported", "string", {
  required: true,
  sort: { icon: "DateRange", label: "Date Imported" },
});

model.addIndex({ dateModified: 1, _id: 1 });
model.addProp("dateModified", "string", {
  required: true,
  sort: { icon: "DateRange", label: "Date Modified" },
});

model.addProp("diffusionParams", "string");

model.addIndex({ duration: 1, _id: 1 });
model.addProp("duration", "number", { sort: { icon: "HourglassBottom", label: "Duration" } });

model.addIndex({ ext: 1 }, { unique: false });
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

model.addIndex({ hasTranscript: 1 }, { unique: false });
model.addProp("hasTranscript", "boolean", { required: true });

model.addIndex({ height: 1, _id: 1 });
model.addProp("height", "number", { required: true, sort: { icon: "Height", label: "Height" } });

model.addIndex({ isArchived: 1 }, { unique: false });
model.addProp("isArchived", "boolean");

model.addIndex({ isCorrupted: 1 }, { unique: false });
model.addProp("isCorrupted", "boolean");

model.addProp("originalAudioBitrate", "number");

model.addProp("originalAudioCodec", "string");

model.addProp("originalBitrate", "number");

model.addProp("originalHash", "string");

model.addIndex({ originalName: 1, _id: 1 });
model.addProp("originalName", "string", { sort: { icon: "Abc", label: "File Name" } });

model.addProp("originalPath", "string", { required: true });

model.addProp("originalSize", "number", { required: true });

model.addProp("originalVideoCodec", "string");

model.addProp("path", "string", { required: true });

model.addIndex({ peakDecibels: 1, _id: 1 });
model.addProp("peakDecibels", "number", {
  sort: { icon: "GraphicEq", label: "Peak Decibels" },
});

model.addIndex({ rating: 1, _id: 1 });
model.addProp("rating", "number", { required: true, sort: { icon: "Star", label: "Rating" } });

model.addIndex({ size: 1, _id: 1 });
model.addProp("size", "number", { required: true, sort: { icon: "FormatSize", label: "Size" } });

model.addIndex({ tagIds: 1 }, { unique: false });
model.addProp("tagIds", "Tag.id[]", { required: true });

model.addIndex({ tagIdsWithAncestors: 1 }, { unique: false });
model.addProp("tagIdsWithAncestors", "Tag.id[]", { required: true });

model.addProp("thumb", "{ frameHeight?: number; frameWidth?: number; path: string }", {
  required: true,
  schemaType: "{ frameHeight: Number, frameWidth: Number, path: String }",
});

model.addProp(
  "timestamps",
  `Array<{
    id: string;
    label: string;
    pairs: Array<{
      endDuration: string;
      id: string;
      order: number;
      startDuration: string;
    }>
  }>`,
  {
    schemaType:
      "[{ id: String, label: String, order: Number, pairs: [{ endDuration: String, id: String, order: Number, startDuration: String }] }]",
  },
);

model.addProp(
  "transcription",
  "{ segments: Array<{ end: number; start: number; text: string }>; text: string }",
  {
    schemaType: "{ segments: [{ end: Number, start: Number, text: String }], text: String }",
  },
);

model.addIndex({ videoCodec: 1 }, { unique: false });
model.addProp("videoCodec", "string");

model.addProp("waveformPeaks", "number[]");

model.addIndex({ width: 1, _id: 1 });
model.addProp("width", "number", {
  required: true,
  sort: { icon: "Height", label: "Width", iconProps: { rotation: 90 } },
});

export const MODEL_FILE = model.getModel();
