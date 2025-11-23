import { ModelDb } from "medior/generator/schema/generators";

const model = new ModelDb("FileImportBatch", { defaultPageSize: 20, withStore: true });

model.addProp("collectionId", "string");

model.addIndex({ collectionTitle: 1, _id: 1 });
model.addProp("collectionTitle", "string");

model.addIndex({ completedAt: 1, _id: 1 });
model.addProp("completedAt", "string", {
  required: true,
  sort: { icon: "HourglassBottom", label: "Completed At" },
});

model.addProp("deleteOnImport", "boolean", { required: true });

model.addIndex({ fileCount: 1, _id: 1 });
model.addProp("fileCount", "number", {
  defaultValue: "0",
  required: true,
  sort: { icon: "Numbers", label: "File Count" },
});

model.addProp("ignorePrevDeleted", "boolean", { required: true });

model.addProp("imports", "FileImport[]", {
  defaultValue: "[]",
  schemaToStoreName: "FileImport",
  schemaType: [
    model.makeProp("dateCreated", "string", { required: true }),
    model.makeProp("diffusionParams", "string"),
    model.makeProp("errorMsg", "string"),
    model.makeProp("extension", "string", { required: true }),
    model.makeProp("fileId", "File.id"),
    model.makeProp("hash", "string"),
    model.makeProp("name", "string", { required: true }),
    model.makeProp("path", "string", { required: true }),
    model.makeProp("size", "number", { required: true }),
    model.makeProp(
      "status",
      "string | 'COMPLETE' | 'DELETED' | 'DUPLICATE' | 'ERROR' | 'PENDING'",
      {
        schemaType:
          "{ type: String, enum: ['COMPLETE', 'DELETED', 'DUPLICATE', 'ERROR', 'PENDING'] }",
      },
    ),
    model.makeProp("tagIds", "Tag.id[]"),
    model.makeProp("thumb", "{ frameHeight?: number; frameWidth?: number; path: string }", {
      schemaType: "{ frameHeight: Number, frameWidth: Number, path: String }",
    }),
  ],
  storeType: "Stores.FileImport[]",
  typeName: "FileImport",
  withStore: true,
});

model.addIndex({ isCompleted: 1, _id: 1 });
model.addProp("isCompleted", "boolean", {
  defaultValue: "false",
  required: true,
});

model.addProp("remux", "boolean");

model.addIndex({ rootFolderPath: 1, _id: 1 });
model.addProp("rootFolderPath", "string", { required: true });

model.addIndex({ size: 1, _id: 1 });
model.addProp("size", "number", {
  sort: { icon: "FormatSize", label: "Size" },
});

model.addIndex({ startedAt: 1, _id: 1 });
model.addProp("startedAt", "string", {
  sort: { icon: "HourglassTop", label: "Started At" },
});

model.addIndex({ tagIds: 1, _id: 1 });
model.addProp("tagIds", "Tag.id[]", {
  defaultValue: "[]",
  required: true,
});

model.addIndex({ tagIdsWithAncestors: 1, _id: 1 });
model.addProp("tagIdsWithAncestors", "Tag.id[]", {
  defaultValue: "[]",
  required: true,
});

export const MODEL_FILE_IMPORT_BATCH = model.getModel();
