import { ModelStore } from "medior/generator/stores/generators";

const model = new ModelStore("File", {
  defaultPageSize: "() => getConfig().file.search.pageSize",
  defaultSort: "() => getConfig().file.search.sort",
  withCarouselIds: true,
  withChangeTracking: true,
  withTags: true,
});

model.addDateRangeProp("dateCreated");
model.addDateRangeProp("dateImported");
model.addDateRangeProp("dateModified");

model.addNumRangeProp("height");
model.addNumRangeProp("longEdge", '{ $max: ["$width", "$height"] }');
model.addNumRangeProp("shortEdge", '{ $min: ["$width", "$height"] }');
model.addNumRangeProp("size");
model.addNumRangeProp("width");

model.addLogOpProp("bitrate");
model.addLogOpProp("duration");
model.addLogOpProp("frameRate");

model.addLogOpProp("numOfCollections", {
  objPath: ["$and"],
  objValue:
    "[{ $expr: { [logicOpsToMongo(args.numOfCollections.logOp)]: [{ $size: { $ifNull: ['$collectionIds', []] } }, args.numOfCollections.value] } }]",
});

model.addLogOpProp("numOfTags", {
  objPath: ["$expr", "~logicOpsToMongo(args.numOfTags.logOp)"],
  objValue: "[{ $size: '$tagIds' }, args.numOfTags.value]",
});

model.addLogOpProp("rating");

model.addTagOptsProp("tagIds", "tagIdsWithAncestors");

model.addProp("diffusionParams", "string", "null", {
  filterGroup: "diffusionParams",
  objPath: ["diffusionParams", "$regex"],
  objValue: "args.diffusionParams",
});

model.addProp("excludedFileIds", "string[]", "() => []", {
  objPath: ["_id", "$nin"],
  objValue: "objectIds(args.excludedFileIds)",
});

model.addProp("hasDiffParams", "boolean", "false", {
  objPath: ["$expr", "$and"],
  objValue: `[
      { $eq: [{ $type: '$diffusionParams' }, 'string'] },
      { $ne: ['$diffusionParams', ''] }
    ]`,
});

/** Audio files read into Music, which every track has an artist credit for. */
model.addProp("hasMusic", "boolean", "false", {
  objPath: ["music.artists.key", "$type"],
  objValue: "'string'",
});

model.addProp("hasTimeline", "boolean", "false", {
  objPath: ["timestamps.id", "$exists"],
  objValue: "true",
});

model.addProp("isArchived", "boolean", "false", {
  customActionProps: [
    model.makeCustomActionProp({
      condition: "true",
      objPath: ["isArchived"],
      objValue: "args.isArchived",
    }),
  ],
  objPath: ["isArchived"],
  objValue: "args.isArchived",
});

model.addProp("isCorrupted", "boolean", "null", {
  objPath: ["$expr"],
  objValue: `args.isCorrupted
    ? { $eq: ["$isCorrupted", true] }
    : { $eq: [ { $ifNull: ["$isCorrupted", false] }, false ] }`,
});

model.addProp("isModified", "boolean", "null", {
  objPath: ["$expr", "$and"],
  objValue: `[
      { $eq: [{ $type: "$originalHash" }, "string"] },
      { $ne: ["$originalHash", ""] },
      { [args.isModified ? "$ne" : "$eq"]: ["$hash", "$originalHash"] }
    ]`,
});

model.addProp("isTranscribed", "boolean", "null", {
  customActionProps: [
    model.makeCustomActionProp({
      condition: "args.isTranscribed === true",
      objPath: ["hasTranscript"],
      objValue: "true",
    }),
    model.makeCustomActionProp({
      condition: "args.isTranscribed === false",
      objPath: ["hasTranscript", "$in"],
      objValue: "[false, null]",
    }),
  ],
});

model.addProp("originalPath", "string", "null", {
  filterGroup: "originalPath",
  objPath: ["originalPath", "$regex"],
  objValue: "args.originalPath",
});

/**
 * Matches transcripts and the stored translations of transcripts and subtitles. Input of only
 * spaces has no search terms, so it filters nothing.
 */
model.addProp("transcription", "string", "null", {
  condition: "!!args.transcription?.trim()",
  filterGroup: "transcription",
  objPath: ["$and"],
  objValue:
    'makeRegexSearchClauses(["transcription.text", "captionTranslations.text"], args.transcription)',
});

model.addProp(
  "selectedAudioCodecs",
  "Types.SelectedAudioCodecs",
  "() => Object.fromEntries(getConfig().file.audioCodecs.map((codec) => [codec, true])) as Types.SelectedAudioCodecs",
  {
    customActionProps: [
      model.makeCustomActionProp({
        condition: "Object.values(args.selectedAudioCodecs).some((selected) => !selected)",
        objPath: ["audioCodec", "$nin"],
        objValue:
          "Object.entries(args.selectedAudioCodecs).filter(([, val]) => !val).map(([ext]) => ext)",
      }),
    ],
    setter: model.makeSetterProp(
      "selectedAudioCodecs",
      ["types: Partial<Types.SelectedAudioCodecs>"],
      "this.selectedAudioCodecs = { ...this.selectedAudioCodecs, ...types };",
    ),
  },
);

model.addProp(
  "selectedAudioExts",
  "Types.SelectedAudioExts",
  "() => Object.fromEntries(getConfig().file.audioExts.map((ext) => [ext, true])) as Types.SelectedAudioExts",
  {
    setter: model.makeSetterProp(
      "selectedAudioExts",
      ["types: Partial<Types.SelectedAudioExts>"],
      "this.selectedAudioExts = { ...this.selectedAudioExts, ...types };",
    ),
  },
);

model.addProp(
  "selectedImageExts",
  "Types.SelectedImageExts",
  "() => Object.fromEntries(getConfig().file.imageExts.map((ext) => [ext, true])) as Types.SelectedImageExts",
  {
    customActionProps: [
      // This handles audio, image and video exts because setObj does not support the `$or: [{}]` syntax
      model.makeCustomActionProp({
        condition:
          "Object.values({ ...args.selectedAudioExts, ...args.selectedImageExts, ...args.selectedVideoExts }).some((selected) => !selected)",
        objPath: ["ext", "$nin"],
        objValue:
          "Object.entries({ ...args.selectedAudioExts, ...args.selectedImageExts, ...args.selectedVideoExts }).filter(([, val]) => !val).map(([ext]) => ext)",
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
      model.makeCustomActionProp({
        condition: "Object.values(args.selectedVideoCodecs).some((selected) => !selected)",
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
