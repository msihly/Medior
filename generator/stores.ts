import { getActions } from "./actions";
import { camelCase, capitalize } from "medior/utils/formatting";

export const makeStoreDef = async (modelDef: ModelDef) => {
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
            ...args,
            page: this.page,
            pageSize: this.pageSize,
            sort: { [this.sortValue.key]: this.sortValue.isDesc ? "desc" : "asc" },
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
