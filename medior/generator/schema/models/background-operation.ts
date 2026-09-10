import { ModelDb } from "medior/generator/schema/generators";

const model = new ModelDb("BackgroundOperation");

model.addProp("completedAt", "string");
model.addProp("dateModified", "string", { required: true });
model.addProp("error", "string");
model.addProp("label", "string", { required: true });
model.addProp("message", "string");
model.addProp("processedCount", "number", { defaultValue: "0", required: true });
model.addProp("startedAt", "string");
model.addProp("status", "'CANCELLED' | 'COMPLETE' | 'ERROR' | 'PENDING' | 'RUNNING'", {
  required: true,
  schemaType: "{ type: String, enum: ['CANCELLED', 'COMPLETE', 'ERROR', 'PENDING', 'RUNNING'] }",
});
model.addProp("targetIds", "string[]", { defaultValue: "[]", required: true });
model.addProp("totalCount", "number", { defaultValue: "0", required: true });
model.addIndex({ type: 1, status: 1, _id: 1 }, { unique: false });
model.addProp(
  "type",
  "'collectionMetadata' | 'fileTagAncestors' | 'repair' | 'tagHierarchy' | 'tagMetadata'",
  {
    required: true,
    schemaType:
      "{ type: String, enum: ['collectionMetadata', 'fileTagAncestors', 'repair', 'tagHierarchy', 'tagMetadata'] }",
  },
);

export const MODEL_BACKGROUND_OPERATION = model.getModel();
