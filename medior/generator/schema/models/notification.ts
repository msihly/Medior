import { ModelDb } from "medior/generator/schema/generators";

const model = new ModelDb("Notification");

model.addProp("isRead", "boolean", { defaultValue: "false", required: true });
model.addProp("message", "string", { required: true });
model.addProp("type", "'error' | 'info' | 'success' | 'warning'", {
  required: true,
  schemaType: "{ type: String, enum: ['error', 'info', 'success', 'warning'] }",
});

export const MODEL_NOTIFICATION = model.getModel();
