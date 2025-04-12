import { ModelDb } from "medior/generator/schema/generators";

const model = new ModelDb("Tag", { withStore: true });

model.addProp("aliases", "string[]", { defaultValue: "[]", required: true });

model.addProp("ancestorIds", "Tag.id[]", { defaultValue: "[]", required: true });

model.addProp("childIds", "Tag.id[]", { defaultValue: "[]", required: true });

model.addProp("count", "number", { required: true, sort: { icon: "Numbers", label: "Count" } });

model.addProp("dateModified", "string", {
  required: true,
  sort: { icon: "DateRange", label: "Date Modified" },
});

model.addProp("descendantIds", "Tag.id[]", { defaultValue: "[]", required: true });

model.addIndex({ label: 1 });
model.addProp("label", "string", { required: true, sort: { icon: "Label", label: "Label" } });

model.addProp("parentIds", "Tag.id[]", { defaultValue: "[]", required: true });

model.addProp(
  "regExMap",
  "{ regEx: string; testString?: string; types: Array<'diffusionParams' | 'fileName' | 'folderName'> }",
  {
    defaultValue: "null",
    schemaType: "{ regEx: String, testString: String, types: [String] }",
  },
);

model.addProp("thumb", "{ frameHeight?: number; frameWidth?: number; path: string }", {
  defaultValue: "null",
  required: true,
  schemaType: "{ frameHeight: Number, frameWidth: Number, path: String }",
});

export const MODEL_TAG = model.getModel();
