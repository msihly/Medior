import { ModelStore } from "medior/generator/stores/generators";

const model = new ModelStore("FileImportBatch", {
  defaultPageSize: "() => getConfig().imports.manager.search.pageSize",
  defaultSort: "() => getConfig().imports.manager.search.sort",
  transformResultsFn:
    "(batch) => ({ ...batch, imports: batch.imports.map(imp => new Stores.FileImport(imp)) })",
  withTags: true,
});

model.addDateRangeProp("completedAt");
model.addDateRangeProp("dateCreated");
model.addDateRangeProp("startedAt");

model.addLogOpProp("fileCount");

model.addTagOptsProp("tagIds", "tagIdsWithAncestors");

model.addProp("collectionTitle", "string", '""', {
  objPath: ["collectionTitle", "$regex"],
  objValue: 'new RegExp(args.collectionTitle, "i")',
});

model.addProp("isCompleted", "boolean", "false", {
  customActionProps: [
    model.makeCustomActionProp("isCompleted", "boolean", {
      condition: "true",
      objPath: ["isCompleted"],
      objValue: "args.isCompleted",
    }),
  ],
  objPath: ["isCompleted"],
  objValue: "args.isCompleted",
});

model.addProp("rootFolderPath", "string", '""', {
  objPath: ["rootFolderPath", "$regex"],
  objValue: 'new RegExp(args.rootFolderPath, "i")',
});

export const MODEL_SEARCH_STORE_FILE_IMPORT_BATCH = model.getModel();
