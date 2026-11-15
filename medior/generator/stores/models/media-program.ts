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

// Unchecked values are excluded. The empty value is the None option, which excludes programs
// missing the detail or left blank.
model.addProp("excludedLanguages", "string[]", "() => []", {
  objPath: ["language", "$nin"],
  objValue: 'args.excludedLanguages.flatMap((value) => (value ? [value] : [null, ""]))',
});

model.addProp("excludedMediums", "string[]", "() => []", {
  objPath: ["medium", "$nin"],
  objValue: 'args.excludedMediums.flatMap((value) => (value ? [value] : [null, ""]))',
});

model.addProp("excludedTypes", "string[]", "() => []", {
  objPath: ["type", "$nin"],
  objValue: 'args.excludedTypes.flatMap((value) => (value ? [value] : [null, ""]))',
});

model.addProp("excludedWatchStatuses", "string[]", "() => []", {
  objPath: ["watchStatus", "$nin"],
  objValue: "args.excludedWatchStatuses",
});

model.addProp("isRewatching", "boolean", "null", {
  objPath: ["isRewatching"],
  objValue: "args.isRewatching",
});

model.addProp("name", "string", '""', {
  filterGroup: "name",
  objPath: ["name", "$regex"],
  objValue: "args.name",
});

export const MODEL_SEARCH_STORE_MEDIA_PROGRAM = model.getModel();
