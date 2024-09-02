import { getActions } from "./actions";
import { MODEL_DEFS } from "./models";
import { camelCase, capitalize } from "medior/utils/formatting";

/* -------------------------------------------------------------------------- */
/*                             GENERATOR FUNCTIONS                            */
/* -------------------------------------------------------------------------- */
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
  const lowerName = camelCase(upperName);
  const itemPrefix = modelDef.withStore ? "" : "_";
  const itemModelName = `${itemPrefix}${upperName}`;

  const includedProps = modelDef.properties.filter((prop) => !prop.excludeFromStore);
  const schemaToStoreProps = modelDef.properties.filter((prop) => prop.schemaToStoreName);

  const actions = await getActions();

  const createSchemaStore = (storeName: string, props: ModelDefProperty[]) => {
    return `@model("medior/_${storeName}")
      export class _${storeName} extends Model({
        ${props
          .map(
            (prop) =>
              `${prop.name}: prop<${prop.storeType || prop.type}>(${getDefaultValue(prop)}),`
          )
          .join("\n")}
      }) {
        @modelAction
        update(updates: Partial<ModelCreationData<this>>) {
          applySnapshot(this, { ...getSnapshot(this), ...updates });
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

  const makeFnAndTypeNames = (rawName: string) => {
    const prefix = `${actions.model.includes(rawName) ? "" : "_"}`;
    return { fnName: `${prefix}${rawName}`, typeName: `${prefix}${capitalize(rawName)}Input` };
  };

  const map = {
    create: makeFnAndTypeNames(`create${modelDef.name}`),
    delete: makeFnAndTypeNames(`delete${modelDef.name}`),
    list: makeFnAndTypeNames(`list${modelDef.name}s`),
    update: makeFnAndTypeNames(`update${modelDef.name}`),
  };

  const makeSectionComment = (sectionName: string) =>
    `/* ${"-".repeat(75)} */\n/* ${" ".repeat(30)}${sectionName}\n/* ${"-".repeat(75)} */`;

  return `${makeSectionComment(upperName)}
    ${createSchemaStore(upperName, includedProps)}

    ${schemaToStoreProps
      .map((prop) =>
        createSchemaStore(prop.schemaToStoreName, prop.schemaType as ModelDefProperty[])
      )
      .join("\n")}

    @model("medior/_${upperName}Store")
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
      create${upperName} = asyncAction(async (args: db.${map.create.typeName}) => {
        this.setIsLoading(true);
        const res = await trpc.${map.create.fnName}.mutate({ args });
        this.setIsLoading(false);
        if (res.error) throw new Error(res.error);
        return res.data;
      });

      @modelFlow
      delete${upperName} = asyncAction(async (args: db.${map.delete.typeName}) => {
        this.setIsLoading(true);
        const res = await trpc.${map.delete.fnName}.mutate({ args });
        this.setIsLoading(false);
        if (res.error) throw new Error(res.error);
        return res.data;
      });

      @modelFlow
      load${upperName}s = asyncAction(async ({ withOverwrite = true, ...args }: db.${map.list.typeName} = {}) => {
        this.setIsLoading(true);
        const res = await trpc.${map.list.fnName}.mutate({
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
      update${upperName} = asyncAction(async (args: db.${map.update.typeName}) => {
        this.setIsLoading(true);
        const res = await trpc.${map.update.fnName}.mutate({ args });
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

    let output = `import { applySnapshot, getSnapshot, Model, model, modelAction, ModelCreationData, modelFlow, prop } from "mobx-keystone";
    import * as db from "medior/database";
    import { SortValue } from "medior/store/_generated/sort-options";
    import { ${storeImports} } from "medior/store";
    import { asyncAction } from "medior/store/utils";
    import { dayjs, trpc } from "medior/utils";\n`;

    for (const def of MODEL_DEFS) {
      output += `${await makeStoreDef(def)}\n\n`;
    }

    return output;
  },
};
