import { ModelDb } from "medior/generator/schema/generators";

const model = new ModelDb("SavedSearch", { withStore: true });

model.addIndex({ searchType: 1, label: 1 }, { unique: true });

model.addProp("filterProps", "Record<string, any>", {
  required: true,
  schemaType: "Object",
});

model.addProp("label", "string", {
  required: true,
  sort: { icon: "Label", label: "Label" },
});

model.addProp("searchType", "string", {
  required: true,
  sort: { icon: "Search", label: "Search Type" },
});

export const MODEL_SAVED_SEARCH = model.getModel();
