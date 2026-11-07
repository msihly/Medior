import { ModelDb } from "medior/generator/schema/generators";

const model = new ModelDb("SavedSearch");

model.addIndex({ searchType: 1, label: 1 }, { unique: true });

/** The result IDs in the order the custom sort shows them, saved by media program rankings. */
model.addProp("customOrderIds", "string[]", { defaultValue: "[]" });

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
