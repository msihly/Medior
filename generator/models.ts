/* -------------------------------------------------------------------------- */
/*                                 MODEL DEFS                                 */
/* -------------------------------------------------------------------------- */
const COMMON_MODEL_PROPS: ModelDef["properties"] = [
  {
    defaultValue: "dayjs().toISOString()",
    name: "dateCreated",
    required: true,
    schemaType: "String",
    sort: { icon: "DateRange", label: "Date Created" },
    type: "string",
  },
  { name: "id", required: true, schemaType: "String", type: "string" },
];

const MODEL_DELETED_FILE: ModelDef = {
  name: "DeletedFile",
  defaultSort: { isDesc: true, key: "hash" },
  indexes: [{ fields: { hash: 1 }, options: { unique: true } }],
  properties: [
    ...COMMON_MODEL_PROPS,
    { name: "hash", required: true, schemaType: "String", type: "string" },
  ],
};

const MODEL_FILE_COLLECTION: ModelDef = {
  name: "FileCollection",
  defaultPageSize: 50,
  defaultSort: { isDesc: true, key: "dateCreated" },
  indexes: [
    { fields: { dateCreated: 1, _id: 1 }, options: { unique: true } },
    { fields: { dateModified: 1, _id: 1 }, options: { unique: true } },
    { fields: { fileCount: 1, _id: 1 }, options: { unique: true } },
    { fields: { rating: 1, _id: 1 }, options: { unique: true } },
    { fields: { tagIds: 1, _id: 1 }, options: { unique: true } },
    { fields: { tagIdsWithAncestors: 1, _id: 1 }, options: { unique: true } },
    { fields: { title: 1, _id: 1 }, options: { unique: true } },
  ],
  properties: [
    ...COMMON_MODEL_PROPS,
    {
      defaultValue: "null",
      name: "dateModified",
      required: true,
      schemaType: "String",
      sort: { icon: "DateRange", label: "Date Modified" },
      type: "string",
    },
    {
      defaultValue: "0",
      name: "fileCount",
      required: true,
      schemaType: "Number",
      sort: { icon: "Numbers", label: "File Count" },
      type: "number",
    },
    {
      name: "fileIdIndexes",
      required: true,
      schemaType: "[{ fileId: Schema.Types.ObjectId, index: Number }]",
      type: "{ fileId: string; index: number }[]",
    },
    {
      defaultValue: "0",
      name: "rating",
      required: true,
      schemaType: "Number",
      sort: { icon: "Star", label: "Rating" },
      type: "number",
    },
    {
      defaultValue: "[]",
      name: "tagIds",
      required: true,
      schemaType: `[{ type: Schema.Types.ObjectId, ref: "Tag" }]`,
      type: "string[]",
    },
    {
      defaultValue: "[]",
      name: "tagIdsWithAncestors",
      required: true,
      schemaType: `[{ type: Schema.Types.ObjectId, ref: "Tag" }]`,
      type: "string[]",
    },
    {
      defaultValue: "[]",
      name: "thumbPaths",
      required: true,
      schemaType: "[String]",
      type: "string[]",
    },
    {
      name: "title",
      required: true,
      schemaType: "String",
      sort: { icon: "Title", label: "Title" },
      type: "string",
    },
  ],
  withStore: true,
};

const MODEL_FILE_IMPORT_BATCH: ModelDef = {
  name: "FileImportBatch",
  defaultSort: { isDesc: true, key: "dateCreated" },
  indexes: [{ fields: { dateCreated: 1, _id: 1 }, options: { unique: true } }],
  properties: [
    ...COMMON_MODEL_PROPS,
    { name: "collectionId", schemaType: "String", type: "string" },
    { name: "collectionTitle", schemaType: "String", type: "string" },
    { name: "completedAt", required: true, schemaType: "String", type: "string" },
    { name: "deleteOnImport", required: true, schemaType: "Boolean", type: "boolean" },
    { name: "ignorePrevDeleted", required: true, schemaType: "Boolean", type: "boolean" },
    {
      defaultValue: "[]",
      name: "imports",
      required: true,
      schemaToStoreName: "FileImport",
      schemaType: [
        { name: "dateCreated", required: true, schemaType: "String", type: "string" },
        { name: "diffusionParams", schemaType: "String", type: "string" },
        { name: "errorMsg", schemaType: "String", type: "string" },
        { name: "extension", required: true, schemaType: "String", type: "string" },
        {
          name: "fileId",
          schemaType: "{ type: Schema.Types.ObjectId, ref: 'File' }",
          type: "string",
        },
        { name: "name", required: true, schemaType: "String", type: "string" },
        { name: "path", required: true, schemaType: "String", type: "string" },
        { name: "size", required: true, schemaType: "Number", type: "number" },
        {
          name: "status",
          required: true,
          schemaType:
            "{ type: String, enum: ['COMPLETE', 'DELETED', 'DUPLICATE', 'ERROR', 'PENDING'] }",
          type: "string | 'COMPLETE' | 'DELETED' | 'DUPLICATE' | 'ERROR' | 'PENDING'",
        },
        {
          name: "tagIds",
          schemaType: "[{ type: Schema.Types.ObjectId, ref: 'Tag' }]",
          type: "string[]",
        },
        { name: "thumbPaths", schemaType: "[String]", type: "string[]" },
      ],
      storeType: "FileImport[]",
      type: "FileImport[]",
      typeName: "FileImport",
      withStore: true,
    },
    { name: "rootFolderPath", required: true, schemaType: "String", type: "string" },
    { name: "startedAt", schemaType: "String", type: "string" },
    { name: "tagIds", required: true, schemaType: "[String]", type: "string[]" },
  ],
  withStore: true,
};

const MODEL_FILE: ModelDef = {
  name: "File",
  defaultSort: { isDesc: true, key: "dateCreated" },
  indexes: [
    { fields: { dateCreated: 1, _id: 1 }, options: { unique: true } },
    { fields: { dateModified: 1, _id: 1 }, options: { unique: true } },
    { fields: { duration: 1, _id: 1 }, options: { unique: true } },
    { fields: { hash: 1 }, options: { unique: true } },
    { fields: { height: 1, _id: 1 }, options: { unique: true } },
    { fields: { isArchived: 1, ext: 1, tagIds: 1, _id: 1 }, options: { unique: true } },
    {
      fields: { isArchived: 1, ext: 1, tagIdsWithAncestors: 1, _id: 1 },
      options: { unique: true },
    },
    { fields: { rating: 1, _id: 1 }, options: { unique: true } },
    { fields: { size: 1, _id: 1 }, options: { unique: true } },
    { fields: { tagIds: 1, _id: 1 }, options: { unique: true } },
    { fields: { tagIdsWithAncestors: 1, _id: 1 }, options: { unique: true } },
    { fields: { width: 1, _id: 1 }, options: { unique: true } },
  ],
  properties: [
    ...COMMON_MODEL_PROPS,
    {
      name: "dateModified",
      required: true,
      schemaType: "String",
      sort: { icon: "DateRange", label: "Date Modified" },
      type: "string",
    },
    { name: "diffusionParams", schemaType: "String", type: "string" },
    {
      name: "duration",
      schemaType: "Number",
      sort: { icon: "HourglassBottom", label: "Duration" },
      type: "number",
    },
    { name: "ext", required: true, schemaType: "String", type: "string" },
    {
      excludeFromStore: true,
      name: "faceModels",
      schemaType: [
        {
          name: "box",
          schemaType: "{ height: Number, width: Number, x: Number, y: Number }",
          type: "{ height: number; width: number; x: number; y: number }",
        },
        { name: "descriptors", schemaType: "[Object]", type: "string" },
        { name: "fileId", schemaType: "Schema.Types.ObjectId", type: "string" },
        { name: "tagId", schemaType: "Schema.Types.ObjectId", type: "string" },
      ],
      storeType: "db.FaceModel[]",
      type: "FaceModel[]",
      typeName: "FaceModel",
    },
    { name: "frameRate", required: true, schemaType: "Number", type: "number" },
    { name: "hash", required: true, schemaType: "String", type: "string" },
    {
      name: "height",
      required: true,
      schemaType: "Number",
      sort: { icon: "Height", label: "Height" },
      type: "number",
    },
    { name: "isArchived", required: true, schemaType: "Boolean", type: "boolean" },
    { name: "originalHash", schemaType: "String", type: "string" },
    { name: "originalName", schemaType: "String", type: "string" },
    { name: "originalPath", required: true, schemaType: "String", type: "string" },
    { name: "path", required: true, schemaType: "String", type: "string" },
    {
      name: "rating",
      required: true,
      schemaType: "Number",
      sort: { icon: "Star", label: "Rating" },
      type: "number",
    },
    {
      name: "size",
      required: true,
      schemaType: "Number",
      sort: { icon: "FormatSize", label: "Size" },
      type: "number",
    },
    {
      defaultValue: "[]",
      name: "tagIds",
      required: true,
      schemaType: `[{ type: Schema.Types.ObjectId, ref: "Tag" }]`,
      type: "string[]",
    },
    {
      defaultValue: "[]",
      name: "tagIdsWithAncestors",
      required: true,
      schemaType: `[{ type: Schema.Types.ObjectId, ref: "Tag" }]`,
      type: "string[]",
    },
    {
      defaultValue: "[]",
      name: "thumbPaths",
      required: true,
      schemaType: "[String]",
      type: "string[]",
    },
    {
      name: "width",
      required: true,
      schemaType: "Number",
      sort: { icon: "Height", label: "Width", iconProps: { rotation: 90 } },
      type: "number",
    },
  ],
  withStore: true,
};

const MODEL_REG_EX_MAP: ModelDef = {
  name: "RegExMap",
  defaultSort: { isDesc: false, key: "regEx" },
  properties: [
    { name: "id", schemaType: "String", type: "string" },
    { name: "regEx", required: true, schemaType: "String", type: "string" },
    { name: "testString", schemaType: "String", type: "string" },
    {
      name: "types",
      required: true,
      schemaType: "[String]",
      type: `Array<"diffusionParams" | "fileName" | "folderName">`,
    },
  ],
};

const MODEL_TAG: ModelDef = {
  name: "Tag",
  defaultSort: { isDesc: false, key: "label" },
  indexes: [{ fields: { label: 1 }, options: { unique: true } }],
  properties: [
    ...COMMON_MODEL_PROPS,
    {
      defaultValue: "[]",
      name: "aliases",
      required: true,
      schemaType: "[String]",
      type: "string[]",
    },
    {
      defaultValue: "[]",
      name: "ancestorIds",
      required: true,
      schemaType: `[{ type: Schema.Types.ObjectId, ref: "Tag" }]`,
      type: "string[]",
    },
    {
      defaultValue: "[]",
      name: "childIds",
      required: true,
      schemaType: `[{ type: Schema.Types.ObjectId, ref: "Tag" }]`,
      type: "string[]",
    },
    {
      name: "count",
      required: true,
      schemaType: "Number",
      sort: { icon: "Numbers", label: "Count" },
      type: "number",
    },
    {
      name: "dateModified",
      required: true,
      schemaType: "String",
      sort: { icon: "DateRange", label: "Date Modified" },
      type: "string",
    },
    {
      defaultValue: "[]",
      name: "descendantIds",
      required: true,
      schemaType: `[{ type: Schema.Types.ObjectId, ref: "Tag" }]`,
      type: "string[]",
    },
    {
      name: "label",
      required: true,
      schemaType: "String",
      sort: { icon: "Label", label: "Label" },
      type: "string",
    },
    {
      defaultValue: "[]",
      name: "parentIds",
      required: true,
      schemaType: `[{ type: Schema.Types.ObjectId, ref: "Tag" }]`,
      type: "string[]",
    },
    {
      defaultValue: "null",
      name: "regExMap",
      required: true,
      schemaType: "RegExMapSchema",
      storeType: "db.RegExMapSchema",
      type: "RegExMapSchema",
    },
    { name: "thumbPaths", required: true, schemaType: "[String]", type: "string[]" },
  ],
  withStore: true,
};

export const MODEL_DEFS = [
  MODEL_DELETED_FILE,
  MODEL_FILE_COLLECTION,
  MODEL_FILE_IMPORT_BATCH,
  MODEL_FILE,
  MODEL_REG_EX_MAP,
  MODEL_TAG,
];

/* -------------------------------------------------------------------------- */
/*                             GENERATOR FUNCTIONS                            */
/* -------------------------------------------------------------------------- */
const makeModelDef = (modelDef: ModelDef) => {
  const schemaName = `${modelDef.name}Schema`;

  const [interfaces, schemaProps] = modelDef.properties.reduce(
    (acc, cur) => {
      if (typeof cur.schemaType === "string") {
        acc[1].push(`${cur.name}: ${cur.schemaType},`);
      } else {
        acc[0].push(
          `export interface ${cur.typeName} { ${cur.schemaType.map((p) => `${p.name}: ${p.type};`).join("\n")} }`
        );
        acc[1].push(
          `${cur.name}: [{ ${cur.schemaType.map((p) => `${p.name}: ${p.schemaType}`)} }],`
        );
      }

      return acc;
    },
    [[] as string[], [] as string[]]
  );

  interfaces.push(`export interface ${schemaName} {
    ${modelDef.properties
      .map((prop) => `${prop.name}${prop.required ? "" : "?"}: ${prop.type};`)
      .join("\n")}
  }`);

  return `/* ------------------------------------ ${modelDef.name} ----------------------------------- */
    ${interfaces.join("\n\n")}

    const ${schemaName} = new Schema<${schemaName}>({
      ${schemaProps.join("\n")}
    });

    ${
      !modelDef.indexes
        ? ""
        : modelDef.indexes
            .map(
              (index) =>
                `${schemaName}.index(${JSON.stringify(index.fields)}, ${JSON.stringify(index.options)});`
            )
            .join("\n")
    }

    export const ${modelDef.name}Model = model<${schemaName}>("${modelDef.name}", ${schemaName});`;
};

/* -------------------------------------------------------------------------- */
/*                                  FILE DEFS                                 */
/* -------------------------------------------------------------------------- */
export const FILE_DEF_MODELS: FileDef = {
  name: "models",
  makeFile: async () => {
    return `import { model, Schema } from "mongoose";\n
      ${MODEL_DEFS.map(makeModelDef).join("\n\n")}`;
  },
};
