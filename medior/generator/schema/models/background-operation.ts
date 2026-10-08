import { ModelDb } from "medior/generator/schema/generators";

const model = new ModelDb("BackgroundOperation", { persistence: true });

model.addProp("completedAt", "string");
model.addProp("dateModified", "string", { required: true });
model.addProp("dismissedAt", "string");
model.addProp("error", "string");

model.addProp("failures", "Array<{ message: string; targetId: string }>", {
  defaultValue: "[]",
  schemaType: "[{ message: String, targetId: String }]",
});

model.addProp("label", "string", { required: true });
model.addProp("message", "string");
model.addProp("processedCount", "number", { defaultValue: "0", required: true });

model.addProp("queueKey", "string");
model.addIndex(
  { queueKey: 1 },
  { partialFilterExpression: { queueKey: { $type: "string" } }, unique: true },
);

model.addProp("source", "string");
model.addProp("startedAt", "string");
model.addProp("status", "'CANCELLED' | 'COMPLETE' | 'ERROR' | 'PENDING' | 'RUNNING'", {
  required: true,
  schemaType: "{ type: String, enum: ['CANCELLED', 'COMPLETE', 'ERROR', 'PENDING', 'RUNNING'] }",
});
model.addProp("targetIds", "string[]", { defaultValue: "[]", required: true });
model.addProp("targetVersions", "Record<string, string>", { schemaType: "Schema.Types.Mixed" });
model.addProp("totalCount", "number", { defaultValue: "0", required: true });
model.addProp("transformIds", "string[]", { defaultValue: "[]" });
model.addProp(
  "transformOptions",
  'import("medior/server/database/actions/file-transforms").TransformQueueOptions',
  { schemaType: "Schema.Types.Mixed" },
);
model.addIndex({ type: 1, status: 1, _id: 1 }, { unique: false });
model.addIndex({ status: 1, completedAt: 1, _id: 1 }, { unique: false });
model.addIndex({ status: 1, dateModified: 1, _id: 1 }, { unique: false });
model.addProp(
  "type",
  "'audioAnalysis' | 'collectionMetadata' | 'duplicateMerge' | 'fileTagAncestors' | 'importEntryMigration' | 'mediaPathIndex' | 'metadataAction' | 'persistenceMigration' | 'repair' | 'tagHierarchy' | 'tagMetadata' | 'tagRefresh' | 'transformQueue'",
  {
    required: true,
    schemaType:
      "{ type: String, enum: ['audioAnalysis', 'collectionMetadata', 'duplicateMerge', 'fileTagAncestors', 'importEntryMigration', 'mediaPathIndex', 'metadataAction', 'persistenceMigration', 'repair', 'tagHierarchy', 'tagMetadata', 'tagRefresh', 'transformQueue'] }",
  },
);

model.addProp("work", 'import("medior/server/database/metadata-work").MetadataWork', {
  schemaType: "Schema.Types.Mixed",
});

export const MODEL_BACKGROUND_OPERATION = model.getModel();
