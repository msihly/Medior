import { ModelDb } from "medior/generator/schema/generators";

const model = new ModelDb("FileImportBatch", { defaultPageSize: 20, withStore: true });

model.addProp("collectionId", "string");

model.addProp("collectionSourceFolderPath", "string");

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

model.addIndex({ isCompleted: 1, _id: 1 });
model.addProp("isCompleted", "boolean", {
  defaultValue: "false",
  required: true,
});

model.addProp("isReady", "boolean", { defaultValue: "false", required: true });

model.addProp("lastUploadHash", "string");

model.addProp("lastUploadOffset", "number");

model.addProp("processedCount", "number", { defaultValue: "0", required: true });

model.addProp("processedSize", "number", { defaultValue: "0", required: true });

model.addProp("progressRevision", "number", { defaultValue: "0", required: true });

model.addIndex({ rootFolderPath: 1, _id: 1 });
model.addProp("rootFolderPath", "string", { required: true });

model.addIndex({ size: 1, _id: 1 });
model.addProp("size", "number", {
  sort: { icon: "FormatSize", label: "Size" },
});

model.addProp("sourceFolderPath", "string");

model.addIndex({ isCompleted: 1, isReady: 1, startedAt: -1, dateCreated: 1 }, { unique: false });
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
