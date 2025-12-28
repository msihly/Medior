import { ModelDb } from "medior/generator/schema/generators";

const model = new ModelDb("TagCategory");

model.addProp("color", "string");

model.addProp("icon", "string");

model.addIndex({ label: 1 });
model.addProp("label", "string", { required: true, sort: { icon: "Label", label: "Label" } });

model.addProp("sortRank", "number");

export const MODEL_TAG_CATEGORY = model.getModel();
