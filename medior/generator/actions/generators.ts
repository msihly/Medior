import { MODEL_DEFS } from "medior/generator/schema/models";
import { MODEL_SEARCH_STORE_DEFS } from "medior/generator/stores/models";
import { capitalize, parseExportsFromIndex, ROOT_PATH } from "medior/generator/utils";

const MODEL_ACTIONS = ["create", "delete", "list", "update"];

/* -------------------------------------------------------------------------- */
/*                                   ACTIONS                                  */
/* -------------------------------------------------------------------------- */
export const getActions = async () => {
  const customActions = await parseExportsFromIndex(
    `${ROOT_PATH}/server/database/actions/index.ts`,
  );
  const customActionsSet = new Set(customActions.map((a) => a.toUpperCase()));
  const modelActions = MODEL_DEFS.flatMap((def) =>
    MODEL_ACTIONS.map((action) => `${action}${def.name}`),
  );
  return {
    custom: customActions,
    model: modelActions.filter((a) => !customActionsSet.has(a.toUpperCase())),
  };
};

const makeFnAndTypeNames = (rawName: string, actions: { custom: string[]; model: string[] }) => {
  const prefix = [...actions.custom].includes(rawName) ? "_" : "";
  return { fnName: `${prefix}${rawName}`, typeName: `${prefix}${capitalize(rawName)}Input` };
};

export const makeActionsDef = async (
  modelDef: ModelDef,
  actions: { custom: string[]; model: string[] },
) => {
  const defaultProps = modelDef.properties
    .filter((prop) => prop.defaultValue)
    .map((prop) => `${prop.name}: ${prop.defaultValue}`);

  const schemaName = `${modelDef.name}Schema`;

  const makeFnPrefix = (fnName: string, typeName: string, withDefault = false) =>
    `export const ${fnName} = makeAction(async ({ args, socketOpts }: { args${withDefault ? "?" : ""}: Types.${typeName}; socketOpts?: SocketEventOptions }${withDefault ? " = {}" : ""}) => {`;

  const makeCreateFn = () => {
    const { fnName, typeName } = makeFnAndTypeNames(`create${modelDef.name}`, actions);
    return `${makeFnPrefix(fnName, typeName)}
        const model = { ...args${defaultProps.length ? `, ${defaultProps.join(", ")}` : ""} };

        const res = await models.${modelDef.name}Model.create(model);
        const id = res._id.toString();

        socket.emit("on${modelDef.name}Created", { ...model, id }, socketOpts);
        return { ...model, id };
      });`;
  };

  const makeDeleteFn = () => {
    const { fnName, typeName } = makeFnAndTypeNames(`delete${modelDef.name}`, actions);
    return `${makeFnPrefix(fnName, typeName)}
        await models.${modelDef.name}Model.deleteMany({ _id: { $in: args.ids } });
        socket.emit("on${modelDef.name}Deleted", args, socketOpts);
      });`;
  };

  const makeListFn = () => {
    const { fnName, typeName } = makeFnAndTypeNames(`list${modelDef.name}`, actions);
    return `${makeFnPrefix(fnName, typeName, true)}
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

        if (!items || !(totalCount > -1)) throw new Error("Failed to load filtered ${modelDef.name}");

        return {
          items: items.map(item => leanModelToJson<models.${schemaName}>(item)),
          pageCount: Math.ceil(totalCount / args.pageSize),
        };
      });`;
  };

  const makeUpdateFn = () => {
    const { fnName, typeName } = makeFnAndTypeNames(`update${modelDef.name}`, actions);
    return `${makeFnPrefix(fnName, typeName)}
        const res = leanModelToJson<models.${schemaName}>(
          await models.${modelDef.name}Model.findByIdAndUpdate(args.id, args.updates, { new: true }).lean()
        );
        socket.emit("on${modelDef.name}Updated", args, socketOpts);
        return res;
      });`;
  };

  return `/* ------------------------------------ ${modelDef.name} ----------------------------------- */
    ${makeCreateFn()}\n
    ${makeDeleteFn()}\n
    ${makeListFn()}\n
    ${makeUpdateFn()}`;
};

export const makeSearchActionsDef = async (
  def: ModelSearchStore,
  actions: { custom: string[]; model: string[] },
) => {
  const modelName = `models.${def.name}Model`;
  const schemaName = `models.${def.name}Schema`;

  const filterFn = makeFnAndTypeNames(`create${def.name}FilterPipeline`, actions);

  const props = def.props.sort((a, b) => a.name.localeCompare(b.name));
  const defaultProps = props.filter(
    (prop) =>
      !prop.customActionProps?.length && prop.objPath?.length && prop.objValue !== undefined,
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

  const makeFilterFn = () => {
    return `export type ${filterFn.typeName} = { ${interfaceProps.map((prop) => `${prop.name}?: ${prop.type};`).join("\n")} }

    export const ${filterFn.fnName} = (args: ${filterFn.typeName}) => {
      const $match: FilterQuery<${schemaName}> = {};

      ${defaultProps
        .map((prop) => `if (${makeDefaultCondition(prop)}) ${makeSetObj(prop)}`)
        .join("\n")}

      ${customProps.map((prop) => `if (${prop.condition}) ${makeSetObj(prop)}`).join("\n")}

      const sortDir = args.sortValue.isDesc ? -1 : 1;

      return {
        $match,
        $sort: { [args.sortValue.key]: sortDir, _id: sortDir } as { [key: string]: 1 | -1 },
      };
    };`;
  };

  const makeGetShiftSelected = () => {
    const { fnName, typeName } = makeFnAndTypeNames(`getShiftSelected${def.name}`, actions);
    return `export type ${typeName} = ${filterFn.typeName} & {
      clickedId: string;
      clickedIndex: number;
      selectedIds: string[];
    }

    export const ${fnName} = makeAction(
      async ({
        clickedId,
        clickedIndex,
        selectedIds,
        ...filterParams
      }: ${typeName}) => {
        const filterPipeline = ${filterFn.fnName}(filterParams);
        return getShiftSelectedItems({
          clickedId,
          clickedIndex,
          filterPipeline,
          ids: filterParams.ids,
          model: ${modelName},
          selectedIds,
        });
      }
    );`;
  };

  const makeListFiltered = () => {
    const countFn = makeFnAndTypeNames(`getFiltered${def.name}Count`, actions);
    const listFn = makeFnAndTypeNames(`listFiltered${def.name}`, actions);
    return `export type ${countFn.typeName} = ${filterFn.typeName} & { pageSize: number; }

    export const ${countFn.fnName} = makeAction(
      async ({ pageSize, ...filterParams }: ${countFn.typeName}) => {
        const filterPipeline = ${filterFn.fnName}(filterParams);
        const count = await ${modelName}.countDocuments(filterPipeline.$match).allowDiskUse(true);
        if (!(count > -1)) throw new Error("Failed to load filtered ${def.name}");
        return { count, pageCount: Math.ceil(count / pageSize)  }
      }
    );

    export type ${listFn.typeName} = ${filterFn.typeName} & { forcePages?: boolean; page: number; pageSize: number; select?: Record<string, 1 | -1> }

    export const ${listFn.fnName} = makeAction(
      async ({ forcePages, page, pageSize, select, ...filterParams }: ${listFn.typeName}) => {
        const filterPipeline = ${filterFn.fnName}(filterParams);
        const hasIds = forcePages || filterParams.ids?.length > 0;

        const items =
          await (hasIds
            ? ${modelName}.aggregate([
                { $match: { _id: { $in: objectIds(filterParams.ids) } } },
                { $addFields: { __order: { $indexOfArray: [objectIds(filterParams.ids), "$_id"] } } },
                { $sort: { __order: 1 } },
                ...(forcePages ? [{ $skip: Math.max(0, page - 1) * pageSize }, { $limit: pageSize }] : [])
              ]).allowDiskUse(true).exec()
            : ${modelName}.find(filterPipeline.$match)
                .sort(filterPipeline.$sort)
                .select(select)
                .skip(Math.max(0, page - 1) * pageSize)
                .limit(pageSize)
                .allowDiskUse(true)
                .lean());

        if (!items) throw new Error("Failed to load filtered ${def.name}");
        return items.map((i) => leanModelToJson<${schemaName}>(i));
      }
    );`;
  };

  return `${makeFilterFn()}\n
    ${makeGetShiftSelected()}\n
    ${makeListFiltered()}\n`;
};

/* -------------------------------------------------------------------------- */
/*                                  ENDPOINTS                                 */
/* -------------------------------------------------------------------------- */
export const makeCustomEndpoint = (name: string) => `${name}: serverEndpoint(db.${name})`;

export const makeModelEndpoint = (
  modelName: string,
  actions: { custom: string[]; model: string[] },
) => {
  return MODEL_ACTIONS.map((action) => {
    const { fnName } = makeFnAndTypeNames(`${action}${capitalize(modelName)}`, actions);
    return `${fnName}: serverEndpoint(db.${fnName})`;
  });
};

export const makeSearchEndpoint = (
  name: string,
  actions: { custom: string[]; model: string[] },
) => {
  const { fnName } = makeFnAndTypeNames(name, actions);
  return `${fnName}: serverEndpoint(db.${fnName})`;
};

export const makeServerRouter = async () => {
  const actions = await getActions();

  const makeCustomEndpoints = () =>
    actions.custom
      .map((name) => makeCustomEndpoint(name))
      .sort()
      .join(",");

  const makeModelEndpoints = () =>
    MODEL_DEFS.flatMap((d) => makeModelEndpoint(d.name, actions))
      .sort()
      .join(",");

  const makeSearchStoreEndpoints = () =>
    MODEL_SEARCH_STORE_DEFS.flatMap((d) =>
      [`getShiftSelected${d.name}`, `getFiltered${d.name}Count`, `listFiltered${d.name}`].map(
        (name) => makeSearchEndpoint(name, actions),
      ),
    )
      .sort()
      .join(",");

  return `export const trpc = initTRPC.create();\n
    /** All resources defined as mutation to deal with max length URLs in GET requests.
     *  @see https://github.com/trpc/trpc/discussions/1936
     */
    export const serverEndpoint = <Input, Output>(fn: (input: Input) => Promise<Output>) =>
      trpc.procedure.input((input: Input) => input).mutation(({ input }) => fn(input));

    export const serverRouter = trpc.router({
      /** Model actions */
      ${makeModelEndpoints()},
      /** Search store actions */
      ${makeSearchStoreEndpoints()},
      /** Custom actions */
      ${makeCustomEndpoints()}
    });`;
};

/* -------------------------------------------------------------------------- */
/*                                    TYPES                                   */
/* -------------------------------------------------------------------------- */
export const makeCustomActionTypes = (customActions: string[]) =>
  customActions
    .map(
      (action) =>
        `export type ${capitalize(action)}Input = Parameters<typeof db.${action}>[0];
       export type ${capitalize(action)}Output = ReturnType<typeof db.${action}>;`,
    )
    .join("\n\n");

export const makeFilterQueryType = () =>
  `export type _FilterQuery<Schema> = {
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
  };`;

export const makeModelActionTypes = (modelName: string, uniqueTypeNames: string[]) => {
  const schemaName = `${modelName}Schema`;
  let output = `/* ------------------------------------ ${modelName} ----------------------------------- */`;

  const append = (typeName: string, value: string) => {
    output += `\nexport type ${uniqueTypeNames.includes(typeName) ? "" : "_"}${typeName} = ${value};`;
  };

  append(`Create${modelName}Input`, `Omit<db.${schemaName}, "id">`);
  append(`Delete${modelName}Input`, `{ ids: string[]; }`);
  append(
    `List${modelName}Input`,
    `{
      filter?: _FilterQuery<db.${schemaName}>;
      page?: number;
      pageSize?: number;
      sort?: Record<string, SortOrder>;
      withOverwrite?: boolean;
    }`,
  );
  append(`Update${modelName}Input`, `{ id: string; updates: Partial<db.${schemaName}>; }`);

  return output;
};
