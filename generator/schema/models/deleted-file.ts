import { ModelDb } from "generator/schema/generators";

const model = new ModelDb("DeletedFile", { defaultSort: { isDesc: true, key: "hash" } });

model.addIndex({ hash: 1 });
model.addProp("hash", "string", { required: true });

export const MODEL_DELETED_FILE = model.getModel();
