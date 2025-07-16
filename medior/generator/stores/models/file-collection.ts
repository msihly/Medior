import { ModelStore } from "medior/generator/stores/generators";

const model = new ModelStore("FileCollection", {
  defaultPageSize: "() => getConfig().collection.manager.search.pageSize",
  defaultSort: "() => getConfig().collection.manager.search.sort",
  withTags: true,
});

model.addDateRangeProp("dateCreated");

model.addDateRangeProp("dateModified");

model.addLogOpProp("fileCount");

model.addLogOpProp("rating");

model.addTagOptsProp("tagIds", "tagIdsWithAncestors");

model.addProp("title", "string", '""', {
  objPath: ["title", "$regex"],
  objValue: 'new RegExp(args.title, "i")',
});

export const MODEL_SEARCH_STORE_FILE_COLLECTION = model.getModel();
