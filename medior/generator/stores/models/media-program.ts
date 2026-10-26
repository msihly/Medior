import { ModelStore } from "medior/generator/stores/generators";

const model = new ModelStore("MediaProgram", {
  defaultPageSize: "() => getConfig().mediaPrograms.manager.search.pageSize",
  defaultSort: "() => getConfig().mediaPrograms.manager.search.sort",
  tagFields: [{ idsName: "genreIds", name: "genres" }],
  withChangeTracking: true,
  withTags: true,
});

model.addDateRangeProp("dateCreated");
model.addDateRangeProp("dateLastWatched");
model.addDateRangeProp("dateModified");

model.addLogOpProp("fileCount");
model.addLogOpProp("rating");

model.addNumRangeProp("year");

model.addTagOptsProp("genreIds", "genreIdsWithAncestors", { label: "Genre", name: "genres" });
model.addTagOptsProp("tagIds", "tagIdsWithAncestors");

model.addProp("isRewatching", "boolean", "null", {
  objPath: ["isRewatching"],
  objValue: "args.isRewatching",
});

model.addProp("languages", "string[]", "() => []", {
  objPath: ["language", "$in"],
  objValue: "args.languages",
});

model.addProp("mediums", "string[]", "() => []", {
  objPath: ["medium", "$in"],
  objValue: "args.mediums",
});

model.addProp("name", "string", '""', {
  filterGroup: "name",
  objPath: ["name", "$regex"],
  objValue: "args.name",
});

model.addProp("types", "string[]", "() => []", {
  objPath: ["type", "$in"],
  objValue: "args.types",
});

model.addProp("watchStatuses", "string[]", "() => []", {
  objPath: ["watchStatus", "$in"],
  objValue: "args.watchStatuses",
});

export const MODEL_SEARCH_STORE_MEDIA_PROGRAM = model.getModel();
