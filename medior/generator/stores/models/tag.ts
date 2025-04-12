import { ModelStore } from "medior/generator/stores/generators";

const model = new ModelStore("Tag", {
  defaultPageSize: "() => getConfig().tags.manager.search.pageSize",
  defaultSort: "() => getConfig().tags.manager.search.sort",
});

model.addTagOptsProp("_id", "ancestorIds");

model.addProp("alias", "string", '""', {
  objPath: ["aliases", "$elemMatch", "$regex"],
  objValue: 'new RegExp(args.alias, "i")',
});

model.addLogOpProp("count");

model.addDateRangeProp("dateCreated");

model.addDateRangeProp("dateModified");

model.addProp("label", "string", '""', {
  objPath: ["label", "$regex"],
  objValue: 'new RegExp(args.label, "i")',
});

model.addProp("regExMode", '"any" | "hasRegEx" | "hasNoRegEx"', '"any"', {
  objPath: ["regExMap.regEx", "$exists"],
  objValue: 'args.regExMode === "hasRegEx"',
});

model.addProp("title", "string", '""', {
  objPath: ["title", "$regex"],
  objValue: 'new RegExp(args.title, "i")',
});

export const MODEL_SEARCH_STORE_TAG = model.getModel();
