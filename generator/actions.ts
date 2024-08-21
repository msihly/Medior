import { capitalize, parseExportsFromIndex } from "medior/utils";
import { MODEL_DEFS } from "./models";
import { ROOT_PATH } from "./utils";

export const getActions = async () => {
  const customActions = await parseExportsFromIndex(`${ROOT_PATH}/database/actions/index.ts`);

  const modelActions = MODEL_DEFS.map((def) =>
    ["create", "delete", "list", "update"].map(
      (action) => `${action}${def.name}${action === "list" ? "s" : ""}`
    )
  ).flat();

  const customActionsSet = new Set(customActions.map((a) => a.toUpperCase()));

  return {
    custom: customActions,
    model: modelActions.filter((a) => !customActionsSet.has(a.toUpperCase())),
  };
};

export const makeActionsDef = async (modelDef: ModelDef) => {
  const actions = await getActions();

  const defaultProps = modelDef.properties
    .filter((prop) => prop.defaultValue)
    .map((prop) => `${prop.name}: ${prop.defaultValue}`);

  const schemaName = `${modelDef.name}Schema`;

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

  return `/* ------------------------------------ ${modelDef.name} ----------------------------------- */
    export const ${map.create.fnName} = makeAction(async ({ args, socketOpts }: { args: db.${map.create.typeName}; socketOpts?: db.SocketEventOptions }) => {
      const model = { ...args${defaultProps.length ? `, ${defaultProps.join(", ")}` : ""} };

      const res = await db.${modelDef.name}Model.create(model);
      const id = res._id.toString();

      socket.emit("on${modelDef.name}Created", { ...model, id }, socketOpts);
      return { ...model, id };
    });

    export const ${map.delete.fnName} = makeAction(async ({ args, socketOpts }: { args: db.${map.delete.typeName}; socketOpts?: db.SocketEventOptions }) => {
      await db.${modelDef.name}Model.findByIdAndDelete(args.id);
      socket.emit("on${modelDef.name}Deleted", args, socketOpts);
    });

    export const ${map.list.fnName} = makeAction(async ({ args: { filter, page, pageSize, sort } }: { args?: db.${map.list.typeName}; socketOpts?: db.SocketEventOptions }  = {}) => {
      const [items, totalCount] = await Promise.all([
        db.${modelDef.name}Model.find(filter)
          .sort(sort ?? ${JSON.stringify({ [modelDef.defaultSort.key]: modelDef.defaultSort.isDesc ? "desc" : "asc" })})
          .skip(Math.max(0, page - 1) * pageSize)
          .limit(pageSize)
          .allowDiskUse(true)
          .lean(),
        db.${modelDef.name}Model.countDocuments(filter),
      ]);

      if (!items || !(totalCount > -1))
        throw new Error("Failed to load filtered ${modelDef.name}s");

      return {
        items: items.map(item => leanModelToJson<db.${schemaName}>(item)),
        pageCount: Math.ceil(totalCount / pageSize),
      };
    });

    export const ${map.update.fnName} = makeAction(async ({ args, socketOpts }: { args: db.${map.update.typeName}; socketOpts?: db.SocketEventOptions }) => {
      const res = leanModelToJson<db.${schemaName}>(
        await db.${modelDef.name}Model.findByIdAndUpdate(args.id, args.updates, { new: true }).lean()
      );

      socket.emit("on${modelDef.name}Updated", args, socketOpts);
      return res;
    });
    `;
};

export const makeCustomActionTypes = (customActions: string[]) =>
  customActions
    .map(
      (action) =>
        `export type ${capitalize(action)}Input = Parameters<typeof db.${action}>[0];
       export type ${capitalize(action)}Output = ReturnType<typeof db.${action}>;`
    )
    .join("\n\n");

export const makeEndpointDefFromCustomAction = (name: string) =>
  `${name}: serverEndpoint(db.${name})`;

export const makeEndpointDefFromModelName = (
  modelName: string,
  uniqueModelActionNames: string[]
) => {
  return ["create", "delete", "list", "update"].map((action) => {
    const actionName = `${action}${capitalize(modelName)}${action === "list" ? "s" : ""}`;
    const prefix = `${uniqueModelActionNames.includes(actionName) ? "" : "_"}`;
    const prefixedName = `${prefix}${actionName}`;
    return `${prefixedName}: serverEndpoint(actions.${prefixedName})`;
  });
};

export const makeModelActionTypes = (modelName: string, uniqueTypeNames: string[]) => {
  const schemaName = `${modelName}Schema`;
  let output = `/* ------------------------------------ ${modelName} ----------------------------------- */`;

  const append = (typeName: string, value: string) => {
    output += `\nexport type ${uniqueTypeNames.includes(typeName) ? "" : "_"}${typeName} = ${value};`;
  };

  append(`Create${modelName}Input`, `Omit<db.${schemaName}, "id">`);
  append(`Delete${modelName}Input`, `{ id: string; }`);
  append(
    `List${modelName}sInput`,
    `{
      filter?: FilterQuery<db.${schemaName}>;
      page?: number;
      pageSize?: number;
      sort?: Record<string, SortOrder>;
      withOverwrite?: boolean;
    }`
  );
  append(`Update${modelName}Input`, `{ id: string; updates: Partial<db.${schemaName}>; }`);

  return output;
};
