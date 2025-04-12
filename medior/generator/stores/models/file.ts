import { ModelStore } from "medior/generator/stores/generators";

const model = new ModelStore("File", {
  defaultPageSize: "() => getConfig().file.search.pageSize",
  defaultSort: "() => getConfig().file.search.sort",
});

model.addDateRangeProp("dateCreated");

model.addDateRangeProp("dateModified");

model.addLogOpProp("numOfTags", {
  objPath: ["$expr", "~logicOpsToMongo(args.numOfTags.logOp)"],
  objValue: "[{ $size: '$tagIds' }, args.numOfTags.value]",
});

model.addLogOpProp("rating");

model.addTagOptsProp("tagIds", "tagIdsWithAncestors");

model.addProp("excludedFileIds", "string[]", "() => []", {
  objPath: ["_id", "$nin"],
  objValue: "objectIds(args.excludedFileIds)",
});

model.addProp("hasDiffParams", "boolean", "false", {
  objPath: ["$expr", "$and"],
  objValue:
    "[{ $eq: [{ $type: '$diffusionParams' }, 'string'] }, { $ne: ['$diffusionParams', ''] }]",
});

model.addProp("isArchived", "boolean", "false", {
  customActionProps: [
    model.makeCustomActionProp("isArchived", "boolean", {
      condition: "true",
      objPath: ["isArchived"],
      objValue: "args.isArchived",
    }),
  ],
  objPath: ["isArchived"],
  objValue: "args.isArchived",
});

model.addProp("isCorrupted", "boolean", "null", {
  objPath: ["isCorrupted"],
  objValue: "args.isCorrupted",
});

model.addProp("maxHeight", "number", "null", {
  objPath: ["height", "$lte"],
  objValue: "args.maxHeight",
});

model.addProp("maxWidth", "number", "null", {
  objPath: ["width", "$lte"],
  objValue: "args.maxWidth",
});

model.addProp("minHeight", "number", "null", {
  objPath: ["height", "$gte"],
  objValue: "args.minHeight",
});

model.addProp("minWidth", "number", "null", {
  objPath: ["width", "$gte"],
  objValue: "args.minWidth",
});

model.addProp("originalPath", "string", "null", {
  objPath: ["originalPath", "$regex"],
  objValue: 'new RegExp(args.originalPath, "i")',
});

model.addProp(
  "selectedImageTypes",
  "Types.SelectedImageTypes",
  "() => Object.fromEntries(getConfig().file.imageTypes.map((ext) => [ext, true])) as Types.SelectedImageTypes",
  {
    customActionProps: [
      model.makeCustomActionProp("selectedImageTypes", "Types.SelectedImageTypes", {
        condition: "true",
        objPath: ["ext", "$nin"],
        objValue:
          "Object.entries({ ...args.selectedImageTypes, ...args.selectedVideoTypes }).filter(([, val]) => !val).map(([ext]) => ext)",
      }),
    ],
    setter: model.makeSetterProp(
      "selectedImageTypes",
      ["types: Partial<Types.SelectedImageTypes>"],
      "this.selectedImageTypes = { ...this.selectedImageTypes, ...types };"
    ),
  }
);

model.addProp(
  "selectedVideoTypes",
  "Types.SelectedVideoTypes",
  "() => Object.fromEntries(getConfig().file.videoTypes.map((ext) => [ext, true])) as Types.SelectedVideoTypes",
  {
    setter: model.makeSetterProp(
      "selectedVideoTypes",
      ["types: Partial<Types.SelectedVideoTypes>"],
      "this.selectedVideoTypes = { ...this.selectedVideoTypes, ...types };"
    ),
  }
);

export const MODEL_SEARCH_STORE_FILE = model.getModel();
