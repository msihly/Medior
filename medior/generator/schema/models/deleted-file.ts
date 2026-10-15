import { ModelDb } from "medior/generator/schema/generators";

const model = new ModelDb("DeletedFile", {
  defaultSort: { isDesc: true, key: "hash" },
  noCommon: true,
});

model.addProp("dateCreated", "string", { required: true });

model.addIndex({ hash: 1 });
model.addProp("hash", "string", { required: true });

/** Gzipped JSON of the deleted file's record, kept when Keep Deleted Metadata is on. Read only on request. */
model.addProp("metadata", "Buffer", {
  excludeFromStore: true,
  schemaType: "{ type: Buffer, select: false }",
});

export const MODEL_DELETED_FILE = model.getModel();
