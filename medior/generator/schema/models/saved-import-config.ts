import { ModelDb } from "medior/generator/schema/generators";

const model = new ModelDb("SavedImportConfig", { withStore: true });

model.addIndex({ dateModified: 1, _id: 1 });
model.addIndex({ folderPath: 1 }, { unique: true });

model.addProp("dateModified", "string", {
  sort: { icon: "DateRange", label: "Date Modified" },
});

model.addProp("folderPath", "string", {
  required: true,
  sort: { icon: "Folder", label: "Folder Path" },
});

model.addProp("label", "string", {
  required: true,
  sort: { icon: "Label", label: "Label" },
});

model.addProp("options", "Record<string, any>", {
  required: true,
  schemaType: "Object",
});

export const MODEL_SAVED_IMPORT_CONFIG = model.getModel();
