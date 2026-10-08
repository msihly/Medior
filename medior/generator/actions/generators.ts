import { MODEL_DEFS } from "medior/generator/schema/models";
import { MODEL_SEARCH_STORE_DEFS } from "medior/generator/stores/models";
import { parseExportsFromIndex, ROOT_PATH } from "medior/generator/utils";
import { Fmt } from "medior/utils/common";

const MODEL_ACTIONS = ["create", "delete", "list", "update"];

/* -------------------------------------------------------------------------- */
/*                                   ACTIONS                                  */
/* -------------------------------------------------------------------------- */
export const getActions = async () => {
  const customActions = await parseExportsFromIndex(
    `${ROOT_PATH}/server/database/actions/index.ts`,
  );

  const customActionsSet = new Set(customActions.map((a) => a.toUpperCase()));

  const modelActions = MODEL_DEFS.filter((def) => def.withActions !== false).flatMap((def) =>
    MODEL_ACTIONS.map((action) => `${action}${def.name}`),
  );

  return {
    custom: customActions,
    model: modelActions.filter((a) => !customActionsSet.has(a.toUpperCase())),
  };
};

const makeFnAndTypeNames = (rawName: string, actions: { custom: string[]; model: string[] }) => {
  const prefix = [...actions.custom].includes(rawName) ? "_" : "";

  return { fnName: `${prefix}${rawName}`, typeName: `${prefix}${Fmt.capitalize(rawName)}Input` };
};

export const makeActionsDef = async (
  modelDef: ModelDef,
  actions: { custom: string[]; model: string[] },
) => {
  const defaultProps = modelDef.properties
    .filter((prop) => prop.defaultValue)
    .map((prop) => `${prop.name}: ${prop.defaultValue}`);

  const schemaName = `${modelDef.name}Schema`;

  const usesMetadataWork = (fnName: string) =>
    /^_?((create|update)(File|FileCollection)|updateTag|deleteFileCollection)$/.test(fnName);

  const makeFnPrefix = (
    fnName: string,
    typeName: string,
    withDefault = false,
    withSocketOpts = true,
  ) =>
    `export const ${fnName} = makeAction(${usesMetadataWork(fnName) ? `registerMetadataWork("generated:${fnName}", ` : ""}async ({ args${withSocketOpts ? ", socketOpts" : ""} }: {
      args${withDefault ? "?" : ""}: Types.${typeName};
      ${withSocketOpts ? "socketOpts?: SocketEventOptions;" : ""}
    }${withDefault ? " = {}" : ""}) => {`;

  const makeCreateFn = () => {
    const { fnName, typeName } = makeFnAndTypeNames(`create${modelDef.name}`, actions);

    if (!["File", "FileCollection"].includes(modelDef.name))
      return `${makeFnPrefix(fnName, typeName)}
        const model = { ...args${defaultProps.length ? `, ${defaultProps.join(", ")}` : ""} };

        const res = await new models.${modelDef.name}Model(model).save(metadataWriteOptions());
        const created = { ...model, id: res._id.toString() };

        socket.emit("on${modelDef.name}Created", created, socketOpts);

        return created;
      }${usesMetadataWork(fnName) ? ")" : ""});`;
    else
      return `${makeFnPrefix(fnName, typeName)}
        const model = { ...args${defaultProps.length ? `, ${defaultProps.join(", ")}` : ""} };

        ${
          modelDef.name === "File"
            ? "await assertMediaPathsAvailable([model.path, model.thumb?.path]);"
            : ""
        }

        const res = await models.${modelDef.name}Model.findOneAndUpdate(
          { _id: getMetadataCreateId("generated:${fnName}") },
          { $setOnInsert: model },
          { ...metadataWriteOptions(), new: true, upsert: true }
        );

        const id = res._id.toString();

        ${
          modelDef.name === "FileCollection"
            ? `await syncCollectionFileIds(
                id,
                model.fileIdIndexes.map(({ fileId }) => String(fileId))
              );`
            : ""
        }

        const created = { ...model, id };

        socket.emit("on${modelDef.name}Created", created, socketOpts);

        return created;
      }${usesMetadataWork(fnName) ? ")" : ""});`;
  };

  const makeDeleteFn = () => {
    const { fnName, typeName } = makeFnAndTypeNames(`delete${modelDef.name}`, actions);

    if (["File", "FileImportBatch", "FileTransform"].includes(modelDef.name))
      return `${makeFnPrefix(fnName, typeName)}
        const deleted = await ${
          modelDef.name === "File"
            ? "deleteFiles({ fileIds: args.ids })"
            : modelDef.name === "FileImportBatch"
              ? "deleteImportBatches(args)"
              : "deleteFileTransforms(args)"
        };

        if (!deleted.success) throw new Error(deleted.error);

        socket.emit("on${modelDef.name}Deleted", args, socketOpts);
      }${usesMetadataWork(fnName) ? ")" : ""});`;
    else if (modelDef.name !== "FileCollection")
      return `${makeFnPrefix(fnName, typeName)}
        await models.${modelDef.name}Model.deleteMany({ _id: { $in: args.ids } }, metadataWriteOptions());

        socket.emit("on${modelDef.name}Deleted", args, socketOpts);
      }${usesMetadataWork(fnName) ? ")" : ""});`;
    else
      return `${makeFnPrefix(fnName, typeName)}
        await models.${modelDef.name}Model.deleteMany({ _id: { $in: args.ids } });

        await removeFileCollectionIds(args.ids);

        socket.emit("on${modelDef.name}Deleted", args, socketOpts);
      }${usesMetadataWork(fnName) ? ")" : ""});`;
  };

  const makeListFn = () => {
    const { fnName, typeName } = makeFnAndTypeNames(`list${modelDef.name}`, actions);

    return `${makeFnPrefix(fnName, typeName, true, false)}
        args ??= {};

        const filter = { ...args.filter };

        if (args.filter?.id) {
          filter._id = Array.isArray(args.filter.id)
            ? { $in: args.filter.id }
            : typeof args.filter.id === "string"
              ? { $in: [args.filter.id] }
              : args.filter.id;

          delete filter.id;
        }

        const items = await models.${modelDef.name}Model.find(filter)
          .sort(args.sort ?? { ${modelDef.defaultSort.key}: "${modelDef.defaultSort.isDesc ? "desc" : "asc"}" })
          .skip(Math.max(0, (args.page ?? 1) - 1) * (args.pageSize ?? 0))
          .limit(args.pageSize ?? 0)
          .allowDiskUse(true)
          .lean();

        const totalCount = await models.${modelDef.name}Model.countDocuments(filter);

        if (!items || !(totalCount > -1)) throw new Error("Failed to load filtered ${modelDef.name}");

        return {
          items: items.map(item => leanModelToJson<models.${schemaName}>(item)),
          pageCount: args.pageSize > 0 ? Math.ceil(totalCount / args.pageSize) : Number(totalCount > 0),
        };
      }${usesMetadataWork(fnName) ? ")" : ""});`;
  };

  const makeUpdateFn = () => {
    const { fnName, typeName } = makeFnAndTypeNames(`update${modelDef.name}`, actions);
    const withDateModified = modelDef.properties.some(({ name }) => name === "dateModified");

    if (!["File", "FileCollection", "Tag"].includes(modelDef.name))
      return `${makeFnPrefix(fnName, typeName)}
        const updates = { ...args.updates${withDateModified ? ", dateModified: dayjs().toISOString()" : ""} };

        const updated = leanModelToJson<models.${schemaName}>(
          await models.${modelDef.name}Model.findByIdAndUpdate(
            args.id,
            updates,
            { new: true, ...metadataWriteOptions() }
          ).lean()
        );

        socket.emit("on${modelDef.name}Updated", { id: args.id, updates }, socketOpts);

        return updated;
      }${usesMetadataWork(fnName) ? ")" : ""});`;
    else
      return `${makeFnPrefix(fnName, typeName)}
        ${
          withDateModified
            ? "const updates = { ...args.updates, dateModified: dayjs().toISOString() };"
            : ""
        }

        ${
          modelDef.name === "File"
            ? "await assertMediaPathsAvailable([args.updates.path, args.updates.thumb?.path]);"
            : ""
        }

        ${
          modelDef.name === "Tag"
            ? `const edited = await editTag({ ...args.updates, id: args.id });

        if (!edited.success) throw new Error(edited.error);`
            : ""
        }

        ${
          modelDef.name === "File"
            ? `if (args.updates.transcription !== undefined)
          updates.hasTranscript = hasTranscription(args.updates.transcription);

        if (args.updates.timestamps !== undefined) {
          const file = await models.FileModel.findById(args.id).select({ duration: 1 }).lean();

          if (!file) throw new Error("File not found");

          updates.timestamps = args.updates.timestamps.map((timestamp) => {
            parseTimestampPairs(timestamp.pairs, file.duration);

            return { ...timestamp, pairs: normalizeTimestampPairs(timestamp.pairs) };
          });
        }`
            : ""
        }

        const updated = leanModelToJson<models.${schemaName}>(
          ${
            modelDef.name === "Tag"
              ? `await models.TagModel.findById(args.id).lean()`
              : `await models.${modelDef.name}Model.findByIdAndUpdate(
            args.id,
            ${modelDef.name === "FileCollection" ? "{ $inc: { __v: 1 }, $set: updates }" : withDateModified ? "updates" : "args.updates"},
            { new: true, ...metadataWriteOptions() }
          ).lean()`
          }
        );

        ${
          modelDef.name === "FileCollection"
            ? `if (updated && args.updates.fileIdIndexes)
                await syncCollectionFileIds(
                  args.id,
                  updated.fileIdIndexes.map(({ fileId }) => String(fileId))
                );`
            : ""
        }

        socket.emit("on${modelDef.name}Updated", ${withDateModified ? "{ ...args, updates }" : "args"}, socketOpts);

        return updated;
      }${usesMetadataWork(fnName) ? ")" : ""});`;
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
    ...props.filter((prop) => !prop.notFilterProp && !prop.noInterface),
    ...customProps.filter((prop) => prop.name && prop.type),
  ].sort((a, b) => a.name.localeCompare(b.name));

  const makeDefaultCondition = (prop: ModelSearchProp) =>
    prop.condition ??
    `args.${prop.name} != null && ${prop.type === "string" ? `args.${prop.name} !== "" && ` : ""}!isDeepEqual(args.${prop.name}, ${prop.defaultValue.replace("() => ", "")})`;

  const makeSetObj = (args: { objPath?: string[]; objValue?: string }, target = "$match") => {
    const appendClause =
      args.objPath[0] === "$expr" || (args.objPath[0] === "_id" && args.objPath[1] === "$in");

    let statement: string;

    if (args.objPath.length === 1 && ["$and", "$nor", "$or"].includes(args.objPath[0])) {
      statement = `(${target}.${args.objPath[0]} ??= []).push(...(${args.objValue}));`;
    } else if (args.objPath.at(-1) === "$regex") {
      statement = `addRegexSearchFilter(${target}, ${JSON.stringify(args.objPath)}, ${args.objValue});`;
    } else {
      statement = `${appendClause ? `(${target}.$and ??= []).push(` : ""}setObj(
      ${appendClause ? "{}" : target},
      [${args.objPath.map((p) => (p.charAt(0) === "~" ? p.substring(1) : `"${p}"`)).join(", ")}],
      ${args.objValue}
    )${appendClause ? ")" : ""};`;
    }

    return statement;
  };

  const makeFilterFn = () => {
    return `export type ${filterFn.typeName} = { ${interfaceProps.map((prop) => `${prop.name}?: ${prop.type};`).join("\n")} }

    export const ${filterFn.fnName} = async (args: ${filterFn.typeName}) => {
      const $match: FilterQuery<${schemaName}> = {};

      ${defaultProps
        .filter((prop) => !prop.filterGroup)
        .map((prop) => `if (${makeDefaultCondition(prop)}) ${makeSetObj(prop)}`)
        .join("\n\n")}

      ${customProps.map((prop) => `${prop.condition === "true" ? "" : `if (${prop.condition}) `}${makeSetObj(prop)}`).join("\n\n")}

      ${[...new Set(defaultProps.map((prop) => prop.filterGroup).filter(Boolean))]
        .sort()
        .map(
          (group) => `{
          const filter: FilterQuery<${schemaName}> = {};

          ${defaultProps
            .filter((prop) => prop.filterGroup === group)
            .map((prop) => `if (${makeDefaultCondition(prop)}) ${makeSetObj(prop, "filter")}`)
            .join("\n\n")}

          if (Object.keys(filter).length) {
            const operator = args.${group}Mode === "optional" ? "$or" : "$and";

            ($match[operator] ??= []).push(filter);
          }
        }`,
        )
        .join("\n\n")}

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
      selectedIds: string[];
    }

    export const ${fnName} = makeAction(
      async ({
        clickedId,
        selectedIds,
        ...filterParams
      }: ${typeName}) => {
        const filterPipeline = await ${filterFn.fnName}(filterParams);

        ${
          def.withCarouselIds
            ? `const plan = filterParams.ids?.length ? null : await createFileSearchPlan(
          filterPipeline.$match,
          Object.fromEntries(Object.keys(filterPipeline.$sort).map((field) => [field, 1])),
        );`
            : ""
        }

        return getShiftSelectedItems({
          clickedId,
          filterPipeline,
          ids: filterParams.ids,
          model: ${modelName},
          ${
            def.withCarouselIds
              ? `searchPlan: plan ? {
            options: plan.options,
            pipeline: [...plan.pipeline, ...createFileSearchSortStages(filterPipeline.$sort, plan.hasRegex)],
          } : undefined,\n`
              : def.name === "FileImportBatch"
                ? `searchPlan: { options: {}, pipeline: [...createImportBatchSearchPipeline(filterPipeline.$match), { $sort: filterPipeline.$sort }] },\n`
                : ""
          }selectedIds,
        });
      }
    );`;
  };

  const makeListFiltered = () => {
    const countFn = makeFnAndTypeNames(`getFiltered${def.name}Count`, actions);
    const listFn = makeFnAndTypeNames(`listFiltered${def.name}`, actions);

    const makeIdsQuery = () => `listItemsByIds({
      ids: filterParams.ids ?? [],
      model: ${modelName},
      ...(forcePages ? { page, pageSize } : {}),
      select,
    })`;

    const makeListQuery = () =>
      def.name === "FileImportBatch"
        ? `const items = await (hasIds
      ? ${makeIdsQuery()}
      : ${modelName}.aggregate([
          ...createImportBatchSearchPipeline(filterPipeline.$match),
          { $sort: filterPipeline.$sort },
          { $skip: Math.max(0, page - 1) * pageSize },
          { $limit: pageSize },
          ...(select ? [{ $project: select }] : []),
        ]).allowDiskUse(true));`
        : `const items =
          await (hasIds
            ? ${makeIdsQuery()}
            : ${modelName}.find(filterPipeline.$match)
                .sort(filterPipeline.$sort)
                .select(select)
                .skip(Math.max(0, page - 1) * pageSize)
                .limit(pageSize)
                .allowDiskUse(true)
                .lean());`;

    const makeListWithCarouselIdsQuery = () => `let carouselFileIds: string[];
        let items;

        if (hasIds) {
          items = await ${makeIdsQuery()};
          carouselFileIds = items.map((item) => item._id.toString());
        } else {
          const searchPlan = await createFileSearchPlan(
            filterPipeline.$match,
            Object.fromEntries(Object.keys(filterPipeline.$sort).map((key) => [key, 1])),
          );

          const [result] = await ${modelName}.aggregate([
            ...searchPlan.pipeline,
            ...createFileSearchSortStages(filterPipeline.$sort, searchPlan.hasRegex),
            {
              $limit: Math.max(
                Math.max(0, page - 1) * pageSize + pageSize,
                Math.max(0, Math.max(0, page - 1) * pageSize - 250) + 501,
              ),
            },
            { $project: { _id: 1 } },
            {
              $facet: {
                carouselFiles: [
                  { $skip: Math.max(0, Math.max(0, page - 1) * pageSize - 250) },
                  { $limit: 501 },
                  { $project: { _id: 1 } },
                ],
                items: [
                  { $skip: Math.max(0, page - 1) * pageSize },
                  { $limit: pageSize },
                  { $project: { _id: 1 } },
                ],
              },
            },
          ]).option(searchPlan.options).allowDiskUse(true).exec();

          carouselFileIds = result.carouselFiles.map((item) => item._id.toString());
          items = select?._id === 1 && Object.keys(select).length === 1
            ? result.items
            : await listItemsByIds({
                ids: result.items.map((item) => item._id.toString()),
                model: ${modelName},
                select,
              });
        }`;

    return `export type ${countFn.typeName} = ${filterFn.typeName} & { curMaxPage: number; forcePages?: boolean; page: number; pageSize: number; withFull: boolean; };

    export const ${countFn.fnName} = makeAction(
      async ({
        curMaxPage,
        forcePages,
        pageSize,
        withFull,
        ...filterParams
      }: ${countFn.typeName}) => {
        const filterPipeline = await ${filterFn.fnName}(filterParams);
        let count: number;
        let pageCount: number;

        if (forcePages || filterParams.ids?.length) {
          const items = await listItemsByIds({
            ids: filterParams.ids ?? [],
            model: ${modelName},
            select: { _id: 1 },
          });

          count = items.length;
          pageCount = Math.ceil(count / pageSize);
        } else if (withFull) {
          count = await ${
            def.withCarouselIds
              ? "countFileSearchResults(filterPipeline.$match)"
              : def.name === "FileImportBatch"
                ? "countImportBatchSearchResults(filterPipeline.$match)"
                : `${modelName}.countDocuments(filterPipeline.$match).allowDiskUse(true)`
          };

          pageCount = Math.ceil(count / pageSize);
        } else {
          const targetPage = Math.max(1, filterParams.page ?? 1);
          const targetMaxPage = targetPage >= (curMaxPage ?? 0) ? targetPage + 1000 : curMaxPage;
          const probeLimit = targetMaxPage * pageSize;

          count = await ${
            def.withCarouselIds
              ? "countFileSearchResults(filterPipeline.$match, probeLimit)"
              : def.name === "FileImportBatch"
                ? "countImportBatchSearchResults(filterPipeline.$match, probeLimit)"
                : `${modelName}.countDocuments(filterPipeline.$match, { limit: probeLimit }).allowDiskUse(true)`
          };

          pageCount = count < probeLimit ? Math.ceil(count / pageSize) : targetMaxPage;
        }

        return { count, pageCount };
      }
    );

    export type ${listFn.typeName} = ${filterFn.typeName} & { forcePages?: boolean; page: number; pageSize: number; select?: Record<string, 1 | -1> }

    export const ${listFn.fnName} = makeAction(
      async ({ forcePages, page, pageSize, select, ...filterParams }: ${listFn.typeName}) => {
        const filterPipeline = await ${filterFn.fnName}(filterParams);
        const hasIds = forcePages || filterParams.ids?.length > 0;

        ${def.withCarouselIds ? makeListWithCarouselIdsQuery() : makeListQuery()}

        if (!items) throw new Error("Failed to load filtered ${def.name}");

        ${
          def.withCarouselIds
            ? `return { carouselFileIds, items: items.map((i) => leanModelToJson<${schemaName}>(i)) };`
            : `return items.map((i) => leanModelToJson<${schemaName}>(i));`
        }
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
    const { fnName } = makeFnAndTypeNames(`${action}${Fmt.capitalize(modelName)}`, actions);

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
    MODEL_DEFS.filter((def) => def.withActions !== false)
      .flatMap((d) => makeModelEndpoint(d.name, actions))
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
        `export type ${Fmt.capitalize(action)}Input = Parameters<typeof db.${action}>[0];
       export type ${Fmt.capitalize(action)}Output = ReturnType<typeof db.${action}>;`,
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
    $comment?: string;
    $nor?: Array<_FilterQuery<Schema>>;
    $or?: Array<_FilterQuery<Schema>>;
    $text?: {
      $caseSensitive?: boolean;
      $diacriticSensitive?: boolean;
      $language?: string;
      $search: string;
    };
    $where?: string | Function;
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
