import { getActions } from "./actions";
import { makeSectionComment } from "./utils";
import { MODEL_DEFS } from "./models";
import { camelCase, capitalize } from "medior/utils/formatting";

/* -------------------------------------------------------------------------- */
/*                                 MODEL DEFS                                 */
/* -------------------------------------------------------------------------- */
const makeCommonProps = (args: { defaultPageSize: string; defaultSort: string; name: string }) => {
  const props: ModelSearchProp[] = [
    {
      defaultValue: "false",
      name: "isLoading",
      notFilterProp: true,
      type: "boolean",
    },
    {
      defaultValue: "1",
      name: "page",
      notFilterProp: true,
      type: "number",
    },
    {
      defaultValue: "1",
      name: "pageCount",
      notFilterProp: true,
      type: "number",
    },
    {
      defaultValue: args.defaultPageSize,
      name: "pageSize",
      notFilterProp: true,
      type: "number",
    },
    {
      defaultValue: "() => []",
      name: "results",
      notFilterProp: true,
      type: `db.${args.name}Schema[]`,
    },
    {
      defaultValue: args.defaultSort,
      name: "sortValue",
      type: "SortMenuProps['value']",
    },
  ];

  return props;
};

const makeDateRangeProps = (name: string) => {
  const props: ModelSearchProp[] = [
    {
      defaultValue: '""',
      name: `${name}End`,
      objPath: [name, "$lte"],
      objValue: `args.${name}End`,
      type: "string",
    },
    {
      defaultValue: '""',
      name: `${name}Start`,
      objPath: [name, "$gte"],
      objValue: `args.${name}Start`,
      type: "string",
    },
  ];

  return props;
};

const makeLogOpProp = (name: string) => ({
  defaultValue: "() => ({ logOp: '', value: 0 })",
  name: name,
  objPath: [name, `~logicOpsToMongo(args.${name}.logOp)`],
  objValue: `args.${name}.value`,
  setter: `${makeSetterProp(`${name}Op`, ["val: LogicalOp | ''"], `this.${name}.logOp = val;`)}\n
    ${makeSetterProp(`${name}Value`, ["val: number"], `this.${name}.value = val;`)}`,
  type: "{ logOp: LogicalOp | '', value: number }",
});

const makeSetterProp = (name: string, args: string[], body: string) =>
  `@modelAction\nset${capitalize(name)}(${args.join(", ")}) {\n${body}\n}`;

const makeTagOptsProp = (): ModelSearchProp => ({
  customActionProps: [
    {
      condition: "args.excludedDescTagIds?.length",
      objPath: ["ancestorIds", "$nin"],
      objValue: "objectIds(args.excludedDescTagIds)",
      name: "excludedDescTagIds",
      type: "string[]",
    },
    {
      condition: "args.excludedTagIds?.length",
      objPath: ["_id", "$nin"],
      objValue: "objectIds(args.excludedTagIds)",
      name: "excludedTagIds",
      type: "string[]",
    },
    {
      condition: "args.optionalTagIds?.length",
      objPath: ["_id", "$in"],
      objValue: "objectIds(args.optionalTagIds)",
      name: "optionalTagIds",
      type: "string[]",
    },
    {
      condition: "args.requiredDescTagIds?.length",
      objPath: ["ancestorIds", "$all"],
      objValue: "objectIds(args.requiredDescTagIds)",
      name: "requiredDescTagIds",
      type: "string[]",
    },
    {
      condition: "args.requiredTagIds?.length",
      objPath: ["_id", "$all"],
      objValue: "objectIds(args.requiredTagIds)",
      name: "requiredTagIds",
      type: "string[]",
    },
  ],
  defaultValue: "() => []",
  filterTransform: "...getRootStore<RootStore>(this).tag.tagSearchOptsToIds(this.tags)",
  name: "tags",
  type: "TagOption[]",
});

export const MODEL_SEARCH_STORES: ModelSearchStore[] = [
  {
    name: "File",
    props: [
      ...makeCommonProps({
        defaultPageSize: "() => getConfig().file.searchFileCount",
        defaultSort: "() => getConfig().file.searchSort",
        name: "File",
      }),
      ...makeDateRangeProps("dateCreated"),
      ...makeDateRangeProps("dateModified"),
      makeTagOptsProp(),
      {
        defaultValue: "() => []",
        name: "excludedFileIds",
        objPath: ["_id", "$nin"],
        objValue: "objectIds(args.excludedFileIds)",
        type: "string[]",
      },
      {
        defaultValue: "false",
        name: "hasDiffParams",
        objPath: ["$expr", "$and"],
        objValue:
          "[{ $eq: [{ $type: '$diffusionParams' }, 'string'] }, { $ne: ['$diffusionParams', ''] }]",
        type: "boolean",
      },
      {
        defaultValue: "false",
        name: "isArchived",
        objPath: ["isArchived"],
        objValue: "args.isArchived",
        type: "boolean",
      },
      {
        defaultValue: "null",
        name: "maxHeight",
        objPath: ["height", "$lte"],
        objValue: "args.maxHeight",
        type: "number",
      },
      {
        defaultValue: "null",
        name: "maxWidth",
        objPath: ["width", "$lte"],
        objValue: "args.maxWidth",
        type: "number",
      },
      {
        defaultValue: "null",
        name: "minHeight",
        objPath: ["height", "$gte"],
        objValue: "args.minHeight",
        type: "number",
      },
      {
        defaultValue: "null",
        name: "minWidth",
        objPath: ["width", "$gte"],
        objValue: "args.minWidth",
        type: "number",
      },
      makeLogOpProp("numOfTags"),
      makeLogOpProp("rating"),
      {
        customActionProps: [
          {
            condition: "true",
            objPath: ["ext", "$nin"],
            objValue:
              "Object.entries({ ...args.selectedImageTypes, ...args.selectedVideoTypes }).filter(([, val]) => !val).map(([ext]) => ext)",
            name: "selectedImageTypes",
            type: "Types.SelectedImageTypes",
          },
        ],
        defaultValue: `() => Object.fromEntries(getConfig().file.imageTypes.map((ext) => [ext, true])) as Types.SelectedImageTypes`,
        name: "selectedImageTypes",
        setter: makeSetterProp(
          "selectedImageTypes",
          ["types: Partial<Types.SelectedImageTypes>"],
          "this.selectedImageTypes = { ...this.selectedImageTypes, ...types };"
        ),
        type: "Types.SelectedImageTypes",
      },
      {
        defaultValue: `() => Object.fromEntries(getConfig().file.videoTypes.map((ext) => [ext, true])) as Types.SelectedVideoTypes`,
        name: "selectedVideoTypes",
        setter: makeSetterProp(
          "selectedVideoTypes",
          ["types: Partial<Types.SelectedVideoTypes>"],
          "this.selectedVideoTypes = { ...this.selectedVideoTypes, ...types };"
        ),
        type: "Types.SelectedVideoTypes",
      },
    ],
  },
  {
    name: "Tag",
    props: [
      ...makeCommonProps({
        defaultPageSize: "() => getConfig().tags.searchTagCount",
        defaultSort: "() => getConfig().tags.managerSearchSort",
        name: "Tag",
      }),
      ...makeDateRangeProps("dateCreated"),
      ...makeDateRangeProps("dateModified"),
      makeLogOpProp("count"),
      makeTagOptsProp(),
      {
        defaultValue: '""',
        name: "alias",
        objPath: ["aliases"],
        objValue: 'new RegExp(args.alias, "i")',
        type: "string",
      },
      {
        defaultValue: '""',
        name: "label",
        objPath: ["label"],
        objValue: 'new RegExp(args.label, "i")',
        type: "string",
      },
      {
        defaultValue: '"any"',
        name: "regExMode",
        objPath: ["regExMap.regEx", "$exists"],
        objValue: 'args.regExMode === "hasRegEx"',
        type: '"any" | "hasRegEx" | "hasNoRegEx"',
      },
    ],
  },
];

/* -------------------------------------------------------------------------- */
/*                             GENERATOR FUNCTIONS                            */
/* -------------------------------------------------------------------------- */
const createSchemaItem = (storeName: string, props: ModelDefProperty[]) => {
  return `@model("medior/_${storeName}")
    export class _${storeName} extends Model({
      ${props
        .map(
          (prop) => `${prop.name}: prop<${prop.storeType || prop.type}>(${getDefaultValue(prop)}),`
        )
        .join("\n")}
    }) {
      @modelAction
      update(updates: Partial<ModelCreationData<this>>) {
        applySnapshot(this, { ...getSnapshot(this), ...updates });
      }
    }`;
};

const createSchemaStore = async (modelDef: ModelDef) => {
  const upperName = modelDef.name;
  const lowerName = camelCase(upperName);
  const itemPrefix = modelDef.withStore ? "" : "_";
  const itemModelName = `${itemPrefix}${upperName}`;
  const schemaStoreMap = await makeSchemaStoreMap(upperName);

  return `@model("medior/_${upperName}Store")
    export class _${upperName}Store extends Model({
      ${lowerName}s: prop<${itemModelName}[]>(() => []),
      isLoading: prop<boolean>(true).withSetter(),
      page: prop<number>(1).withSetter(),
      pageCount: prop<number>(1).withSetter(),
      pageSize: prop<number>(${modelDef.defaultPageSize}).withSetter(),
      sortValue: prop<SortValue>(() => (${JSON.stringify(modelDef.defaultSort)})).withSetter(),
    }) {
      /* ---------------------------- STANDARD ACTIONS ---------------------------- */
      @modelAction
      _add${upperName}(${lowerName}: ModelCreationData<${itemModelName}>) {
        this.${lowerName}s.push(new ${itemModelName}(${lowerName}));
      }

      @modelAction
      _delete${upperName}(id: string) {
        this.${lowerName}s = this.${lowerName}s.filter((d) => d.id !== id);
      }

      @modelAction
      overwrite${upperName}s(${lowerName}s: ModelCreationData<${itemModelName}>[]) {
        this.${lowerName}s = ${lowerName}s.map((d) => new ${itemModelName}(d));
      }

      /* ------------------------------ ASYNC ACTIONS ----------------------------- */
      @modelFlow
      create${upperName} = asyncAction(async (args: db.${schemaStoreMap.create.typeName}) => {
        this.setIsLoading(true);
        const res = await trpc.${schemaStoreMap.create.fnName}.mutate({ args });
        this.setIsLoading(false);
        if (res.error) throw new Error(res.error);
        return res.data;
      });

      @modelFlow
      delete${upperName} = asyncAction(async (args: db.${schemaStoreMap.delete.typeName}) => {
        this.setIsLoading(true);
        const res = await trpc.${schemaStoreMap.delete.fnName}.mutate({ args });
        this.setIsLoading(false);
        if (res.error) throw new Error(res.error);
        return res.data;
      });

      @modelFlow
      load${upperName}s = asyncAction(async ({ withOverwrite = true, ...args }: db.${schemaStoreMap.list.typeName} = {}) => {
        this.setIsLoading(true);
        const res = await trpc.${schemaStoreMap.list.fnName}.mutate({
          args: {
            filter: JSON.parse(JSON.stringify(args.filter)),
            page: args.page ?? this.page,
            pageSize: args.pageSize ?? this.pageSize,
            sort: args.sort ?? { [this.sortValue.key]: this.sortValue.isDesc ? "desc" : "asc" },
          },
        });
        this.setIsLoading(false);
        if (res.error) throw new Error(res.error);
        if (withOverwrite) {
          this.overwrite${upperName}s(res.data.items as ModelCreationData<${itemModelName}>[]);
          this.setPageCount(res.data.pageCount);
        }
        return res.data;
      });

      @modelFlow
      update${upperName} = asyncAction(async (args: db.${schemaStoreMap.update.typeName}) => {
        this.setIsLoading(true);
        const res = await trpc.${schemaStoreMap.update.fnName}.mutate({ args });
        this.setIsLoading(false);
        if (res.error) throw new Error(res.error);
        return res.data;
      });

      /* ----------------------------- DYNAMIC GETTERS ---------------------------- */
      get${upperName}(id: string) {
        return this.${lowerName}s.find((d) => d.id === id);
      }
    }`;
};

const createSearchStore = (def: ModelSearchStore) => {
  const props = [...def.props].sort((a, b) => a.name.localeCompare(b.name));

  return `@model("medior/_${def.name}Search")
    export class _${def.name}Search extends Model({
      ${props
        .map(
          (prop) =>
            `${prop.name}: prop<${prop.type}>(${prop.defaultValue})${!prop.setter ? ".withSetter()" : ""}`
        )
        .join(",\n")}
    }) {
      /* ---------------------------- STANDARD ACTIONS ---------------------------- */
      @modelAction
      reset() {
        ${props.map((prop) => `this.${prop.name} = ${prop.defaultValue.replace("() => ", "")};`).join("\n")}
      }

      ${props
        .filter((prop) => prop.setter)
        .map((prop) => prop.setter)
        .join("\n\n")}

      /* ------------------------------ ASYNC ACTIONS ----------------------------- */
      @modelFlow
      getShiftSelected = asyncAction(
        async ({ id, selectedIds }: { id: string; selectedIds: string[] }) => {
          const clickedIndex =
            (this.page - 1) * this.pageSize + this.results.findIndex((r) => r.id === id);

          const res = await trpc.getShiftSelected${def.name}s.mutate({
            ...this.getFilterProps(),
            clickedId: id,
            clickedIndex,
            selectedIds,
          });
          if (!res.success) throw new Error(res.error);
          return res.data;
        }
      );

      @modelFlow
      loadFiltered = asyncAction(async ({ page }: { page?: number } = {}) => {
        const debug = false;
        const { perfLog, perfLogTotal } = makePerfLog("[${def.name}Search]");
        this.setIsLoading(true);

        const res = await trpc.listFiltered${def.name}s.mutate({
          ...this.getFilterProps(),
          page: page ?? this.page,
          pageSize: this.pageSize,
        });
        if (!res.success) throw new Error(res.error);

        const { items, pageCount } = res.data;
        if (debug) perfLog(\`Loaded \${items.length} items\`);

        this.setResults(items);
        if (debug) perfLog("Overwrite and re-render");

        this.setPageCount(pageCount);
        if (page) this.setPage(page);
        if (debug) perfLog(\`Set page to \${page ?? this.page} and pageCount to \${pageCount}\`);

        if (debug) perfLogTotal(\`Loaded \${items.length} items\`);
        this.setIsLoading(false);
        return items;
      });

      /* --------------------------------- GETTERS -------------------------------- */
      @computed
      get numOfFilters() {
        return (
          ${props
            .filter((prop) => !(prop.notFilterProp || prop.notTrackedFilter))
            .map(
              (prop) =>
                `(!isDeepEqual(this.${prop.name}, ${prop.defaultValue.replace("() => ", "")}) ? 1 : 0)`
            )
            .join(" +\n")}
        );
      }

      /* --------------------------------- DYNAMIC GETTERS -------------------------------- */
      getFilterProps() {
        return {
          ${props
            .filter((prop) => !prop.notFilterProp)
            .map((prop) => prop.filterTransform ?? `${prop.name}: this.${prop.name}`)
            .join(",\n")}
        };
      }
    }`;
};

const getDefaultValue = (prop: ModelDefProperty) => {
  if (prop.defaultValue) {
    return /^([{\[]|dayjs\(\))/.test(prop.defaultValue)
      ? `() => ${prop.defaultValue}`
      : prop.defaultValue;
  } else return prop.required ? "" : "null";
};

const makeFnAndTypeNames = (modelActions: string[], rawName: string) => {
  const prefix = `${modelActions.includes(rawName) ? "" : "_"}`;
  return { fnName: `${prefix}${rawName}`, typeName: `${prefix}${capitalize(rawName)}Input` };
};

const makeSchemaStoreMap = async (upperName: string) => {
  const actions = await getActions();

  return {
    create: makeFnAndTypeNames(actions.model, `create${upperName}`),
    delete: makeFnAndTypeNames(actions.model, `delete${upperName}`),
    list: makeFnAndTypeNames(actions.model, `list${upperName}s`),
    update: makeFnAndTypeNames(actions.model, `update${upperName}`),
  };
};

const makeSortDef = (modelDef: ModelDef) => {
  return `"${modelDef.name}": [${modelDef.properties
    .filter((prop) => prop.sort)
    .map(
      (prop) =>
        `{ attribute: "${prop.name}",
           icon: "${prop.sort.icon}",${prop.sort.iconProps ? ` iconProps: ${JSON.stringify(prop.sort.iconProps)},` : ""}
           label: "${prop.sort.label}" }`
    )
    .join(", ")}]`;
};

const makeStoreDef = async (modelDef: ModelDef) => {
  const upperName = modelDef.name;

  const includedProps = modelDef.properties.filter((prop) => !prop.excludeFromStore);
  const schemaToStoreProps = modelDef.properties.filter((prop) => prop.schemaToStoreName);

  return `${makeSectionComment(upperName)}
    ${createSchemaItem(upperName, includedProps)}

    ${schemaToStoreProps
      .map((prop) =>
        createSchemaItem(prop.schemaToStoreName, prop.schemaType as ModelDefProperty[])
      )
      .join("\n")}

    ${await createSchemaStore(modelDef)}`;
};

/* -------------------------------------------------------------------------- */
/*                                  FILE DEFS                                 */
/* -------------------------------------------------------------------------- */
export const FILE_DEF_SORT_OPTIONS: FileDef = {
  name: "sort-options",
  makeFile: async () => {
    return `import { IconName, IconProps } from "medior/components/media/icon";\n
      export interface SortOption {
        attribute: string;
        icon: IconName;
        iconProps?: Partial<IconProps>;
        label: string;
      }\n
      export interface SortValue {
        isDesc: boolean;
        key: string;
      }\n
      export const SORT_OPTIONS: Record<${MODEL_DEFS.map((m) => `"${m.name}"`).join(" | ")}, SortOption[]> = {
        ${MODEL_DEFS.map(makeSortDef)}
      };`;
  },
};

export const FILE_DEF_STORES: FileDef = {
  name: "stores",
  makeFile: async () => {
    const storeImports = [
      ...MODEL_DEFS.filter((m) => m.withStore).map((m) => m.name),
      ...MODEL_DEFS.flatMap((d) => d.properties)
        .filter((p) => p.withStore)
        .map((p) => p.schemaToStoreName),
    ].join(", ");

    let output = `import { computed } from "mobx";
    import { applySnapshot, getRootStore, getSnapshot, Model, model, modelAction, ModelCreationData, modelFlow, prop } from "mobx-keystone";
    import * as db from "medior/database";
    import * as Types from "medior/database/types";
    import { SortValue } from "medior/store/_generated/sort-options";
    import { ${storeImports}, RootStore, TagOption } from "medior/store";
    import { asyncAction } from "medior/store/utils";
    import { SortMenuProps } from "medior/components";
    import { dayjs, getConfig, isDeepEqual, LogicalOp, makePerfLog, trpc } from "medior/utils";\n\n`;

    output += `;\n`;
    output += makeSectionComment("SEARCH STORES");
    for (const def of MODEL_SEARCH_STORES) {
      output += `\n${createSearchStore(def)}\n`;
    }

    output += `\n${makeSectionComment("SCHEMA STORES")}`;
    for await (const def of MODEL_DEFS) {
      output += `\n${await makeStoreDef(def)}\n`;
    }

    return output;
  },
};
