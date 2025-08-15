import { ModelStore } from "medior/generator/stores/generators";

const model = new ModelStore("File", {
  defaultPageSize: "() => getConfig().file.search.pageSize",
  defaultSort: "() => getConfig().file.search.sort",
  withTags: true,
});

model.addDateRangeProp("dateCreated");
model.addDateRangeProp("dateModified");

model.addNumRangeProp("height");
model.addNumRangeProp("size");
model.addNumRangeProp("width");

model.addLogOpProp("bitrate");
model.addLogOpProp("duration");
model.addLogOpProp("frameRate");

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

model.addProp("originalPath", "string", "null", {
  objPath: ["originalPath", "$regex"],
  objValue: 'new RegExp(args.originalPath, "i")',
});

model.addProp(
  "selectedImageExts",
  "Types.SelectedImageExts",
  "() => Object.fromEntries(getConfig().file.imageExts.map((ext) => [ext, true])) as Types.SelectedImageExts",
  {
    customActionProps: [
      // This handles both image and video exts because setObj does not support the `$or: [{}]` syntax
      model.makeCustomActionProp("selectedImageExts", "Types.SelectedImageExts", {
        condition: "true",
        objPath: ["ext", "$nin"],
        objValue:
          "Object.entries({ ...args.selectedImageExts, ...args.selectedVideoExts }).filter(([, val]) => !val).map(([ext]) => ext)",
      }),
    ],
    setter: model.makeSetterProp(
      "selectedImageExts",
      ["types: Partial<Types.SelectedImageExts>"],
      "this.selectedImageExts = { ...this.selectedImageExts, ...types };",
    ),
  },
);

model.addProp(
  "selectedVideoCodecs",
  "Types.SelectedVideoCodecs",
  "() => Object.fromEntries(getConfig().file.videoCodecs.map((codec) => [codec, true])) as Types.SelectedVideoCodecs",
  {
    customActionProps: [
      model.makeCustomActionProp("selectedVideoCodecs", "Types.SelectedVideoCodecs", {
        condition: "true",
        objPath: ["videoCodec", "$nin"],
        objValue:
          "Object.entries(args.selectedVideoCodecs).filter(([, val]) => !val).map(([ext]) => ext)",
      }),
    ],
    setter: model.makeSetterProp(
      "selectedVideoCodecs",
      ["types: Partial<Types.SelectedVideoCodecs>"],
      "this.selectedVideoCodecs = { ...this.selectedVideoCodecs, ...types };",
    ),
  },
);

model.addProp(
  "selectedVideoExts",
  "Types.SelectedVideoExts",
  "() => Object.fromEntries(getConfig().file.videoExts.map((ext) => [ext, true])) as Types.SelectedVideoExts",
  {
    setter: model.makeSetterProp(
      "selectedVideoExts",
      ["types: Partial<Types.SelectedVideoExts>"],
      "this.selectedVideoExts = { ...this.selectedVideoExts, ...types };",
    ),
  },
);

export const MODEL_SEARCH_STORE_FILE = model.getModel();
