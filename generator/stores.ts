import { getActions } from "./actions";
import { makeSectionComment } from "./utils";
import { MODEL_DEFS } from "./models";
import { capitalize } from "medior/utils/formatting";
import { deepMerge } from "medior/utils";

/* -------------------------------------------------------------------------- */
/*                                 MODEL DEFS                                 */
/* -------------------------------------------------------------------------- */
const makeCommonProps = (args: { defaultPageSize: string; defaultSort: string; name: string }) => {
  const props: ModelSearchProp[] = [
    {
      defaultValue: "false",
      name: "forcePages",
      notFilterProp: true,
      type: "boolean",
    },
    {
      defaultValue: "false",
      name: "hasChanges",
      notFilterProp: true,
      type: "boolean",
    },
    {
      defaultValue: "() => []",
      name: "ids",
      objPath: ["_id", "$in"],
      objValue: "objectIds(args.ids)",
      type: "string[]",
    },
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
      type: `Stores.${args.name}[]`,
    },
    {
      defaultValue: "() => []",
      name: "selectedIds",
      notFilterProp: true,
      type: "string[]",
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

const makeTagOptsProp = (idName: string, ancestorsName: string): ModelSearchProp => ({
  customActionProps: [
    {
      condition: "args.excludedDescTagIds?.length",
      objPath: [ancestorsName, "$nin"],
      objValue: "objectIds(args.excludedDescTagIds)",
      name: "excludedDescTagIds",
      type: "string[]",
    },
    {
      condition: "args.excludedTagIds?.length",
      objPath: [idName, "$nin"],
      objValue: "objectIds(args.excludedTagIds)",
      name: "excludedTagIds",
      type: "string[]",
    },
    {
      condition: "args.optionalTagIds?.length",
      objPath: [idName, "$in"],
      objValue: "objectIds(args.optionalTagIds)",
      name: "optionalTagIds",
      type: "string[]",
    },
    {
      condition: "args.requiredDescTagIds?.length",
      objPath: [ancestorsName, "$all"],
      objValue: "objectIds(args.requiredDescTagIds)",
      name: "requiredDescTagIds",
      type: "string[]",
    },
    {
      condition: "args.requiredTagIds?.length",
      objPath: [idName, "$all"],
      objValue: "objectIds(args.requiredTagIds)",
      name: "requiredTagIds",
      type: "string[]",
    },
  ],
  defaultValue: "() => []",
  filterTransform: "...getRootStore<Stores.RootStore>(this)?.tag?.tagSearchOptsToIds(this.tags)",
  name: "tags",
  type: "Stores.TagOption[]",
});

export const CUSTOM_SORT_OPTIONS: Record<string, string[]> = {
  FileCollectionFile: [
    `{ attribute: "custom", icon: "Settings", label: "Custom" }`,
    `{ attribute: "originalName", icon: "Abc", label: "Original Name" }`,
    `...MODEL_SORT_OPTIONS.File`,
  ],
};

export const MODEL_SEARCH_STORES: ModelSearchStore[] = [
  {
    name: "File",
    props: [
      ...makeCommonProps({
        defaultPageSize: "() => getConfig().file.search.pageSize",
        defaultSort: "() => getConfig().file.search.sort",
        name: "File",
      }),
      ...makeDateRangeProps("dateCreated"),
      ...makeDateRangeProps("dateModified"),
      deepMerge(makeLogOpProp("numOfTags"), {
        objPath: ["$expr", "~logicOpsToMongo(args.numOfTags.logOp)"],
        objValue: "[{ $size: '$tagIds' }, args.numOfTags.value]",
      }),
      makeLogOpProp("rating"),
      makeTagOptsProp("tagIds", "tagIdsWithAncestors"),
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
        customActionProps: [
          {
            condition: "true",
            objPath: ["isArchived"],
            objValue: "args.isArchived",
            name: "isArchived",
            type: "boolean",
          },
        ],
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
      {
        defaultValue: '""',
        name: "originalPath",
        objPath: ["originalPath", "$regex"],
        objValue: 'new RegExp(args.originalPath, "i")',
        type: "string",
      },
      {
        customActionProps: [
          {
            condition: "true",
            objPath: ["ext", "$nin"],
            objValue:
              "Object.entries({ ...args.selectedImageTypes, ...args.selectedVideoTypes }).filter(([, val]) => !val).map(([ext]) => `.${ext}`)",
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
    name: "FileCollection",
    props: [
      ...makeCommonProps({
        defaultPageSize: "() => getConfig().collection.manager.search.pageSize",
        defaultSort: "() => getConfig().collection.manager.search.sort",
        name: "FileCollection",
      }),
      ...makeDateRangeProps("dateCreated"),
      ...makeDateRangeProps("dateModified"),
      makeTagOptsProp("tagIds", "tagIdsWithAncestors"),
      makeLogOpProp("fileCount"),
      makeLogOpProp("rating"),
      {
        defaultValue: '""',
        name: "title",
        objPath: ["title", "$regex"],
        objValue: 'new RegExp(args.title, "i")',
        type: "string",
      },
    ],
  },
  {
    name: "Tag",
    props: [
      ...makeCommonProps({
        defaultPageSize: "() => getConfig().tags.manager.search.pageSize",
        defaultSort: "() => getConfig().tags.manager.search.sort",
        name: "Tag",
      }),
      ...makeDateRangeProps("dateCreated"),
      ...makeDateRangeProps("dateModified"),
      makeLogOpProp("count"),
      makeTagOptsProp("_id", "ancestorIds"),
      {
        defaultValue: '""',
        name: "alias",
        objPath: ["aliases", "$elemMatch", "$regex"],
        objValue: 'new RegExp(args.alias, "i")',
        type: "string",
      },
      {
        defaultValue: '""',
        name: "label",
        objPath: ["label", "$regex"],
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
  const schemaStoreMap = await makeSchemaStoreMap(upperName);

  return `@model("aio/_${upperName}Store")
    export class _${upperName}Store extends Model({
      isLoading: prop<boolean>(false).withSetter(),
    }) {
      /* ------------------------------ ASYNC ACTIONS ----------------------------- */
      @modelFlow
      create${upperName} = asyncAction(async (args: Types.${schemaStoreMap.create.typeName}) => {
        this.setIsLoading(true);
        const res = await trpc.${schemaStoreMap.create.fnName}.mutate({ args });
        this.setIsLoading(false);
        if (res.error) throw new Error(res.error);
        return res.data;
      });

      @modelFlow
      delete${upperName} = asyncAction(async (args: Types.${schemaStoreMap.delete.typeName}) => {
        this.setIsLoading(true);
        const res = await trpc.${schemaStoreMap.delete.fnName}.mutate({ args });
        this.setIsLoading(false);
        if (res.error) throw new Error(res.error);
        return res.data;
      });

      @modelFlow
      update${upperName} = asyncAction(async (args: Types.${schemaStoreMap.update.typeName}) => {
        this.setIsLoading(true);
        const res = await trpc.${schemaStoreMap.update.fnName}.mutate({ args });
        this.setIsLoading(false);
        if (res.error) throw new Error(res.error);
        return res.data;
      });
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

      @modelAction
      toggleSelected(selected: { id: string; isSelected?: boolean }[], withToast = false) {
        if (!selected?.length) return;

        const [added, removed] = selected.reduce(
          (acc, cur) => (acc[cur.isSelected ? 0 : 1].push(cur.id), acc),
          [[], []]
        );

        const removedSet = new Set(removed);
        this.selectedIds = [...new Set(this.selectedIds.concat(added))].filter(
          (id) => !removedSet.has(id)
        );

        if (withToast) {
          const addedCount = added.length;
          const removedCount = removed.length;
          if (addedCount && removedCount) {
            toast.success(\`Selected \${addedCount} items and deselected \${removedCount} items\`);
          } else if (addedCount) {
            toast.success(\`Selected \${addedCount} items\`);
          } else if (removedCount) {
            toast.success(\`Deselected \${removedCount} items\`);
          }
        }
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
      handleSelect = asyncAction(async ({ hasCtrl, hasShift, id }: { hasCtrl: boolean; hasShift: boolean; id: string }) => {
        if (hasShift) {
          const res = await this.getShiftSelected({ id, selectedIds: this.selectedIds });
          if (!res?.success) throw new Error(res.error);
          this.toggleSelected([
            ...res.data.idsToDeselect.map((i) => ({ id: i, isSelected: false })),
            ...res.data.idsToSelect.map((i) => ({ id: i, isSelected: true })),
          ]);
        } else if (hasCtrl) {
          this.toggleSelected([{ id, isSelected: !this.getIsSelected(id) }]);
        } else {
          this.toggleSelected([
            ...this.selectedIds.map((id) => ({ id, isSelected: false })),
            { id, isSelected: true },
          ]);
        }
      });

      @modelFlow
      loadFiltered = asyncAction(async ({ page }: { page?: number } = {}) => {
        const debug = false;
        const { perfLog, perfLogTotal } = makePerfLog("[${def.name}Search]");
        this.setIsLoading(true);

        const res = await trpc.listFiltered${def.name}s.mutate({
          ...this.getFilterProps(),
          forcePages: this.forcePages,
          page: page ?? this.page,
          pageSize: this.pageSize,
        });
        if (!res.success) throw new Error(res.error);

        const { items, pageCount } = res.data;
        if (debug) perfLog(\`Loaded \${items.length} items\`);

        this.setResults(items.map((item) => new Stores.${def.name}(item)));
        if (debug) perfLog("Overwrite and re-render");

        this.setPageCount(pageCount);
        if (page) this.setPage(page);
        if (debug) perfLog(\`Set page to \${page ?? this.page} and pageCount to \${pageCount}\`);

        if (debug) perfLogTotal(\`Loaded \${items.length} items\`);
        this.setIsLoading(false);
        this.setHasChanges(false);
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

      getIsSelected(id: string) {
        return !!this.selectedIds.find((s) => s === id);
      }

      getResult(id: string) {
        return this.results.find((r) => r.id === id);
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
    const makeSortType = (names: string[]) => names.map((name) => `"${name}"`).join(" | ");

    return `import { IconName, IconProps } from "medior/components/media/icon";\n
      export interface SortOption {
        attribute: string;
        icon: IconName;
        iconProps?: Partial<IconProps>;
        label: string;
      }

      export interface SortValue {
        isDesc: boolean;
        key: string;
      }

      type ModelSortName = ${makeSortType(MODEL_DEFS.map((d) => d.name))};

      type CustomSortName = ${makeSortType(Object.keys(CUSTOM_SORT_OPTIONS))};

      const MODEL_SORT_OPTIONS: Record<ModelSortName, SortOption[]> = {
        ${MODEL_DEFS.map(makeSortDef).join(",\n")}
      };

      const CUSTOM_SORT_OPTIONS: Record<CustomSortName, SortOption[]> = {
        ${Object.entries(CUSTOM_SORT_OPTIONS)
          .map(([key, value]) => `${key}: [${value.join(", ")}]`)
          .join(",\n")}
      };

      export const SORT_OPTIONS = { ...MODEL_SORT_OPTIONS, ...CUSTOM_SORT_OPTIONS };`;
  },
};

export const FILE_DEF_STORES: FileDef = {
  name: "stores",
  makeFile: async () => {
    let output = `import { computed } from "mobx";
    import { applySnapshot, getRootStore, getSnapshot, Model, model, modelAction, ModelCreationData, modelFlow, prop } from "mobx-keystone";
    import * as models from "medior/_generated/models";
    import * as Types from "medior/database/types";
    import * as Stores from "medior/store";
    import { asyncAction } from "medior/store/utils";
    import { SortMenuProps } from "medior/components";
    import { dayjs, getConfig, isDeepEqual, LogicalOp, makePerfLog, trpc } from "medior/utils";
    import { toast } from "react-toastify";\n\n`;

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
