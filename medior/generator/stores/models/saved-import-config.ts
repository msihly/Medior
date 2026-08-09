import { ModelStore } from "medior/generator/stores/generators";

const model = new ModelStore("SavedImportConfig", {
  defaultPageSize: "20",
  defaultSort: "() => ({ isDesc: true, key: 'dateModified' })",
});

model.addDateRangeProp("dateModified");

model.addProp("folderPath", "string", '""', {
  objPath: ["folderPath", "$regex"],
  objValue: 'new RegExp(args.folderPath, "i")',
  setter: model.makeSetterProp(
    "folderPath",
    ["value: string"],
    "this.folderPath = value;\nthis.hasChanges = true;",
  ),
});

model.addProp("label", "string", '""', {
  objPath: ["label", "$regex"],
  objValue: 'new RegExp(args.label, "i")',
  setter: model.makeSetterProp(
    "label",
    ["value: string"],
    "this.label = value;\nthis.hasChanges = true;",
  ),
});

export const MODEL_SEARCH_STORE_SAVED_IMPORT_CONFIG = model.getModel();
