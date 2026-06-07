import { ModelDb } from "medior/generator/schema/generators";

const model = new ModelDb("DeletedFile", {
  defaultSort: { isDesc: true, key: "hash" },
  noCommon: true,
});

model.addProp("dateCreated", "string", { required: true });

model.addIndex({ hash: 1 });
model.addProp("hash", "string", { required: true });

export const MODEL_DELETED_FILE = model.getModel();
