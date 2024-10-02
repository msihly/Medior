import { capitalize, parseExportsFromIndex } from "medior/utils";
import { MODEL_DEFS } from "./models";
import { MODEL_SEARCH_STORES } from "./stores";
import { makeSectionComment, ROOT_PATH } from "./utils";

/* -------------------------------------------------------------------------- */
/*                             GENERATOR FUNCTIONS                            */
/* -------------------------------------------------------------------------- */
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

const makeActionsDef = async (modelDef: ModelDef) => {
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
    export const ${map.create.fnName} = makeAction(async ({ args, socketOpts }: { args: Types.${map.create.typeName}; socketOpts?: SocketEventOptions }) => {
      const model = { ...args${defaultProps.length ? `, ${defaultProps.join(", ")}` : ""} };

      const res = await models.${modelDef.name}Model.create(model);
      const id = res._id.toString();

      socket.emit("on${modelDef.name}Created", { ...model, id }, socketOpts);
      return { ...model, id };
    });

    export const ${map.delete.fnName} = makeAction(async ({ args, socketOpts }: { args: Types.${map.delete.typeName}; socketOpts?: SocketEventOptions }) => {
      await models.${modelDef.name}Model.findByIdAndDelete(args.id);
      socket.emit("on${modelDef.name}Deleted", args, socketOpts);
    });

    export const ${map.list.fnName} = makeAction(async ({ args }: { args: Types.${map.list.typeName}; socketOpts?: SocketEventOptions }) => {
      const filter = { ...args.filter };
      if (args.filter?.id) {
        filter._id = Array.isArray(args.filter.id)
          ? { $in: args.filter.id }
          : typeof args.filter.id === "string"
            ? { $in: [args.filter.id] }
            : args.filter.id;

        delete filter.id;
      }

      const [items, totalCount] = await Promise.all([
        models.${modelDef.name}Model.find(filter)
          .sort(args.sort ?? { ${modelDef.defaultSort.key}: "${modelDef.defaultSort.isDesc ? "desc" : "asc"}" })
          .skip(Math.max(0, args.page - 1) * args.pageSize)
          .limit(args.pageSize)
          .allowDiskUse(true)
          .lean(),
        models.${modelDef.name}Model.countDocuments(filter),
      ]);

      if (!items || !(totalCount > -1))
        throw new Error("Failed to load filtered ${modelDef.name}s");

      return {
        items: items.map(item => leanModelToJson<models.${schemaName}>(item)),
        pageCount: Math.ceil(totalCount / args.pageSize),
      };
    });

    export const ${map.update.fnName} = makeAction(async ({ args, socketOpts }: { args: Types.${map.update.typeName}; socketOpts?: SocketEventOptions }) => {
      const res = leanModelToJson<models.${schemaName}>(
        await models.${modelDef.name}Model.findByIdAndUpdate(args.id, args.updates, { new: true }).lean()
      );

      socket.emit("on${modelDef.name}Updated", args, socketOpts);
      return res;
    });
    `;
};

const makeCustomActionTypes = (customActions: string[]) =>
  customActions
    .map(
      (action) =>
        `export type ${capitalize(action)}Input = Parameters<typeof db.${action}>[0];
       export type ${capitalize(action)}Output = ReturnType<typeof db.${action}>;`
    )
    .join("\n\n");

const makeEndpointDefFromCustomAction = (name: string) => `${name}: serverEndpoint(db.${name})`;

const makeEndpointDefFromModelName = (modelName: string, uniqueModelActionNames: string[]) => {
  return ["create", "delete", "list", "update"].map((action) => {
    const actionName = `${action}${capitalize(modelName)}${action === "list" ? "s" : ""}`;
    const prefix = `${uniqueModelActionNames.includes(actionName) ? "" : "_"}`;
    const prefixedName = `${prefix}${actionName}`;
    return `${prefixedName}: serverEndpoint(db.${prefixedName})`;
  });
};

const makeModelActionTypes = (modelName: string, uniqueTypeNames: string[]) => {
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
      filter?: _FilterQuery<db.${schemaName}>;
      page?: number;
      pageSize?: number;
      sort?: Record<string, SortOrder>;
      withOverwrite?: boolean;
    }`
  );
  append(`Update${modelName}Input`, `{ id: string; updates: Partial<db.${schemaName}>; }`);

  return output;
};

const makeSearchActionsDef = (def: ModelSearchStore) => {
  const filterFnName = `create${def.name}FilterPipeline`;
  const filterFnNameType = `${capitalize(filterFnName)}Input`;
  const modelName = `models.${def.name}`;

  const props = def.props.sort((a, b) => a.name.localeCompare(b.name));
  const defaultProps = props.filter(
    (prop) => !prop.customActionProps?.length && prop.objPath?.length && prop.objValue !== undefined
  );
  const customProps = props
    .filter((prop) => prop.customActionProps?.length)
    .flatMap((prop) => prop.customActionProps);

  const interfaceProps = [
    ...props.filter((prop) => !prop.notFilterProp && !prop.customActionProps?.length),
    ...customProps,
  ].sort((a, b) => a.name.localeCompare(b.name));

  const makeDefaultCondition = (prop: ModelSearchProp) =>
    `!isDeepEqual(args.${prop.name}, ${prop.defaultValue.replace("() => ", "")})`;

  const makeSetObj = (args: { objPath?: string[]; objValue?: string }) =>
    `setObj($match, [${args.objPath.map((p) => (p.charAt(0) === "~" ? p.substring(1) : `"${p}"`)).join(", ")}], ${args.objValue});`;

  return `export type ${filterFnNameType} = {
      ${interfaceProps.map((prop) => `${prop.name}?: ${prop.type};`).join("\n")}
    }

    export const ${filterFnName} = (args: ${filterFnNameType}) => {
      const $match: FilterQuery<${modelName}Schema> = {};

      ${defaultProps
        .map((prop) => `if (${makeDefaultCondition(prop)}) ${makeSetObj(prop)}`)
        .join("\n")}

      ${customProps.map((prop) => `if (${prop.condition}) ${makeSetObj(prop)}`).join("\n")}

      const sortDir = args.sortValue.isDesc ? -1 : 1;

      return {
        $match,
        $sort: { [args.sortValue.key]: sortDir, _id: sortDir } as { [key: string]: 1 | -1 },
      };
    };

    export const getShiftSelected${def.name}s = makeAction(
      async ({
        clickedId,
        clickedIndex,
        selectedIds,
        ...filterParams
      }: ${filterFnNameType} & {
        clickedId: string;
        clickedIndex: number;
        selectedIds: string[];
      }) => {
        const filterPipeline = ${filterFnName}(filterParams);
        return getShiftSelectedItems({
          clickedId,
          clickedIndex,
          filterPipeline,
          ids: filterParams.ids,
          model: ${modelName}Model,
          selectedIds,
        });
      }
    );

    export const listFiltered${def.name}s = makeAction(
      async ({
        forcePages,
        page,
        pageSize,
        ...filterParams
      }: ${filterFnNameType} & { forcePages?: boolean; page: number; pageSize: number; }) => {
        const filterPipeline = ${filterFnName}(filterParams);
        const hasIds = forcePages || filterParams.ids?.length > 0;

        const [items, count] = await Promise.all([
          hasIds
            ? ${modelName}Model.aggregate([
                { $match: { _id: { $in: objectIds(filterParams.ids) } } },
                { $addFields: { __order: { $indexOfArray: [objectIds(filterParams.ids), "$_id"] } } },
                { $sort: { __order: 1 } },
              ]).allowDiskUse(true).exec()
            : ${modelName}Model.find(filterPipeline.$match)
                .sort(filterPipeline.$sort)
                .skip(Math.max(0, page - 1) * pageSize)
                .limit(pageSize)
                .allowDiskUse(true)
                .lean(),
          ${modelName}Model.countDocuments(filterPipeline.$match),
        ]);
        if (!items || !(count > -1)) throw new Error("Failed to load filtered ${def.name}s");

        return {
          count,
          items: items.map((i) => leanModelToJson<${modelName}Schema>(i)),
          pageCount: Math.ceil(count / pageSize)
        };
      }
    );`;
};

/* -------------------------------------------------------------------------- */
/*                                  FILE DEFS                                 */
/* -------------------------------------------------------------------------- */
export const FILE_DEF_ACTIONS: FileDef = {
  name: "actions",
  makeFile: async () => {
    let output = `import { FilterQuery } from "mongoose";
      import * as models from "medior/_generated/models";
      import * as Types from "medior/database/types";
      import { SocketEventOptions } from "medior/_generated/socket";
      import { getShiftSelectedItems, leanModelToJson, makeAction, objectIds } from "medior/database/utils";
      import { SortMenuProps } from "medior/components";
      import { dayjs, isDeepEqual, LogicalOp, logicOpsToMongo, setObj, socket } from "medior/utils";\n`;

    output += `\n${makeSectionComment("SEARCH ACTIONS")}`;
    for (const def of MODEL_SEARCH_STORES) {
      output += `\n${makeSearchActionsDef(def)}\n`;
    }

    output += `\n${makeSectionComment("MODEL ACTIONS")}`;
    for (const def of MODEL_DEFS) {
      output += `\n${await makeActionsDef(def)}\n`;
    }

    return output;
  },
};

export const FILE_DEF_ENDPOINTS: FileDef = {
  name: "endpoints",
  makeFile: async () => {
    const actions = await getActions();

    return `import { initTRPC } from "@trpc/server";
      import * as db from "medior/database/actions";

      export const trpc = initTRPC.create();

      /** All resources defined as mutation to deal with max length URLs in GET requests.
       *  @see https://github.com/trpc/trpc/discussions/1936
       */
      export const serverEndpoint = <Input, Output>(fn: (input: Input) => Promise<Output>) =>
        trpc.procedure.input((input: Input) => input).mutation(({ input }) => fn(input));

      export const serverRouter = trpc.router({
        /** Model actions */
        ${MODEL_DEFS.flatMap((d) => makeEndpointDefFromModelName(d.name, actions.model))
          .sort()
          .join(",")},
        /** Search store actions */
        ${MODEL_SEARCH_STORES.flatMap((d) =>
          [`getShiftSelected${d.name}s`, `listFiltered${d.name}s`].map((name) =>
            makeEndpointDefFromCustomAction(name)
          )
        )
          .sort()
          .join(",")},
        /** Custom actions */
        ${actions.custom.map(makeEndpointDefFromCustomAction).sort().join(",")}
      });`;
  },
};

export const FILE_DEF_TYPES: FileDef = {
  name: "types",
  makeFile: async () => {
    const actions = await getActions();

    return `import * as db from "medior/database";
      import { QuerySelector, SortOrder } from "mongoose";

      export type _FilterQuery<Schema> = {
        [SchemaKey in keyof Schema]?:
          | Schema[SchemaKey]
          | Array<Schema[SchemaKey]>
          | QuerySelector<Schema[SchemaKey]>;
      } & {
        _id?: string | Array<string> | QuerySelector<string>;
        $and?: Array<_FilterQuery<Schema>>;
        $nor?: Array<_FilterQuery<Schema>>;
        $or?: Array<_FilterQuery<Schema>>;
        $text?: {
          $search: string;
          $language?: string;
          $caseSensitive?: boolean;
          $diacriticSensitive?: boolean;
        };
        $where?: string | Function;
        $comment?: string;
      };

      /* -------------------------------------------------------------------------- */
      /*                                MODEL ACTIONS                               */
      /* -------------------------------------------------------------------------- */
      ${MODEL_DEFS.map((def) =>
        makeModelActionTypes(
          def.name,
          actions.model.map((a) => `${capitalize(a)}Input`)
        )
      ).join("\n\n")}

      /* -------------------------------------------------------------------------- */
      /*                               CUSTOM ACTIONS                               */
      /* -------------------------------------------------------------------------- */
      ${makeCustomActionTypes(actions.custom)}\n`;
  },
};
