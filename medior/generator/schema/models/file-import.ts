import { ModelDb } from "medior/generator/schema/generators";
import { FILE_IMPORT_SIDECAR_FIELDS } from "medior/utils/common/imports";

const model = new ModelDb("FileImport", {
  idDefault: "null",
  noCommon: true,
  withActions: false,
});

model.addIndex({ batchId: 1, index: 1 });
model.addIndex({ batchId: 1, status: 1, index: 1 });
model.addIndex({ batchId: 1, path: 1 }, { unique: false });
model.addProp("batchId", "FileImportBatch.id");

model.addProp("dateCreated", "string", { required: true });

model.addProp("diffusionParams", "string");

model.addProp("errorMsg", "string");

model.addProp("extension", "string", { required: true });

model.addIndex({ fileId: 1, _id: 1 });
model.addProp("fileId", "File.id");

model.addProp("hash", "string");

model.addProp("index", "number");

model.addProp("name", "string", { required: true });

model.addProp("path", "string", { required: true });

model.addProp("progressRevision", "number", { defaultValue: "0" });

model.addProp(
  "sidecar",
  `Partial<Pick<FileSchema, ${FILE_IMPORT_SIDECAR_FIELDS.filter((field) => field !== "collections")
    .map((field) => `"${field}"`)
    .join(" | ")}> & { collections: Array<{ id: string; index: number }> }>`,
  { excludeFromStore: true, schemaType: "Schema.Types.Mixed" },
);

model.addProp("size", "number", { required: true });

model.addProp("subtitles", "Array<{ path: string }>", { schemaType: "[{ path: String }]" });

model.addProp("status", "string | 'COMPLETE' | 'DELETED' | 'DUPLICATE' | 'ERROR' | 'PENDING'", {
  defaultValue: '"PENDING"',
  schemaType: "{ type: String, enum: ['COMPLETE', 'DELETED', 'DUPLICATE', 'ERROR', 'PENDING'] }",
});

model.addIndex({ tagIds: 1, _id: 1 });
model.addProp("tagIds", "Tag.id[]", { defaultValue: "[]" });

model.addProp(
  "thumb",
  "{ frameHeight?: number; frameWidth?: number; ntfsFileId?: string; ntfsVolumeId?: string; path: string }",
  {
    schemaType:
      "{ frameHeight: Number, frameWidth: Number, ntfsFileId: String, ntfsVolumeId: String, path: String }",
  },
);

export const MODEL_FILE_IMPORT = model.getModel();
