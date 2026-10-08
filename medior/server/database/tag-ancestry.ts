import mongoose, { ClientSession, PipelineStage, Query, Schema, Types } from "mongoose";
import { getBackgroundSession } from "medior/server/database/database-context";
import { collectRelatedTagIds } from "medior/utils/common/tag-hierarchy";

export const loadTagGraph = async (
  ids: string[],
  descendants: boolean,
  session?: ClientSession,
) => {
  const tags = new Map<string, string[]>();
  const queried = new Set<string>();
  let pending = [...new Set(ids)];
  let roots = true;

  while (pending.length) {
    const next = new Set<string>();

    for (let offset = 0; offset < pending.length; offset += 500) {
      const batch = pending.slice(offset, offset + 500);
      const documents = await mongoose.models.Tag.find({
        [descendants && !roots ? "parentIds" : "_id"]: {
          $in: batch.map((id) => new Types.ObjectId(id)),
        },
      })
        .select({ _id: 1, parentIds: 1 })
        .session(session ?? getBackgroundSession() ?? null)
        .lean<Array<{ _id: Types.ObjectId; parentIds: Types.ObjectId[] }>>();

      if (!descendants || !roots) batch.forEach((id) => queried.add(id));

      for (const tag of documents) {
        const id = String(tag._id);
        const parents = (tag.parentIds ?? []).map(String);

        tags.set(id, parents);

        for (const related of descendants ? [id] : parents) {
          if (!queried.has(related)) next.add(related);
        }
      }
    }

    pending = [...next].filter((id) => !queried.has(id));
    roots = false;
  }

  if (!descendants) return tags;

  const graph = new Map([...tags.keys()].map((id) => [id, [] as string[]]));

  for (const [id, parents] of tags) {
    for (const parent of parents) graph.get(parent)?.push(id);
  }

  return graph;
};

export const getRelatedTags = async (
  ids: unknown[],
  descendants: boolean,
  session?: ClientSession,
) => {
  if (!ids.length) return [];

  const graph = await loadTagGraph(ids.map(String), descendants, session);

  return [...new Set(ids.map(String))]
    .filter((id) => graph.has(id))
    .map((id) => ({
      _id: new Types.ObjectId(id),
      related: collectRelatedTagIds(graph, [id]).map((related) => new Types.ObjectId(related)),
    }));
};

/** Search against direct membership; inherited membership comes from the same tag graph as reads. */
export const resolveAncestorFilter = async (
  filter: Record<string, any>,
  session?: ClientSession,
  field = "tagIdsWithAncestors",
  targetField = "tagIds",
  descendants = true,
) => {
  const clauses: Record<string, any>[] = [];
  const direct: Record<string, any> = {};

  for (const [key, value] of Object.entries(filter)) {
    if (["$and", "$nor", "$or"].includes(key)) {
      direct[key] = [];

      for (const child of value)
        direct[key].push(
          await resolveAncestorFilter(child, session, field, targetField, descendants),
        );
    } else if (key !== field) direct[key] = value;
    else {
      const conditions =
        value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        !(value instanceof Types.ObjectId)
          ? value
          : { $eq: value };

      for (const [operator, operand] of Object.entries(conditions)) {
        if (operator === "$not") {
          clauses.push({
            $nor: [
              await resolveAncestorFilter(
                { [field]: operand },
                session,
                field,
                targetField,
                descendants,
              ),
            ],
          });
        } else if (operator === "$exists") {
          if (!operand) clauses.push({ _id: { $in: [] } });
        } else {
          if (!["$all", "$eq", "$in", "$ne", "$nin"].includes(operator))
            throw new Error(`Unsupported inherited tag operator: ${operator}`);

          if ((operator === "$eq" || operator === "$ne") && Array.isArray(operand))
            throw new Error(
              "Use $all or $in for inherited tag arrays; equality requires a single tag",
            );

          const ids = Array.isArray(operand) ? operand : [operand];

          if (operator === "$all") {
            const related = new Map(
              (await getRelatedTags(ids, descendants, session)).map((tag) => [
                String(tag._id),
                tag.related,
              ]),
            );

            for (const id of ids)
              clauses.push({
                [targetField]: {
                  $in: related.get(String(id)) ?? [],
                },
              });

            if (!ids.length) clauses.push({ _id: { $in: [] } });
          } else {
            const graph = await loadTagGraph(ids.map(String), descendants, session);

            clauses.push({
              [targetField]: {
                [operator === "$ne" || operator === "$nin" ? "$nin" : "$in"]: collectRelatedTagIds(
                  graph,
                  ids.map(String),
                ).map((id) => new Types.ObjectId(id)),
              },
            });
          }
        }
      }
    }
  }

  return clauses.length ? { $and: [direct, ...clauses] } : direct;
};

const deriveMediaAncestors = async (documents: any, session?: ClientSession) => {
  const items = (Array.isArray(documents) ? documents : [documents]).filter((item) =>
    Array.isArray(item?.tagIds),
  );

  const ids = [...new Set(items.flatMap((item) => item.tagIds.map(String)))];

  if (!ids.length) {
    for (const item of items) item.tagIdsWithAncestors = [];

    return;
  }

  const graph = await loadTagGraph(ids, false, session);

  for (const item of items)
    item.tagIdsWithAncestors = collectRelatedTagIds(graph, item.tagIds.map(String)).map(
      (id) => new Types.ObjectId(id),
    );
};

const selectsField = (projection: Record<string, unknown>, field: string) => {
  if (!projection || !Object.keys(projection).length) return true;
  else if (projection[field] != null) return projection[field] !== 0 && projection[field] !== false;
  else {
    const fields = Object.entries(projection).filter(([key]) => key !== "_id");

    return fields.length
      ? !fields.some(([, value]) => value !== 0 && value !== false)
      : projection._id !== 1 && projection._id !== true;
  }
};

const prepareAncestorProjection = (projection: Record<string, unknown>) => {
  if (!selectsField(projection, "tagIdsWithAncestors") || selectsField(projection, "tagIds"))
    return;

  if (projection.tagIds === 0 || projection.tagIds === false) {
    delete projection.tagIds;

    if (projection._id === 1 || projection._id === true) delete projection._id;
  } else projection.tagIds = 1;
};

const deriveSelectedAncestors = async (
  documents: any,
  projection: Record<string, unknown>,
  session?: ClientSession,
) => {
  if (!selectsField(projection, "tagIdsWithAncestors")) return;

  await deriveMediaAncestors(documents, session);

  if (!selectsField(projection, "tagIds")) {
    for (const document of Array.isArray(documents) ? documents : [documents]) {
      if (!document) continue;

      if (typeof document.set === "function") document.set("tagIds", undefined);
      else delete document.tagIds;
    }
  }
};

const resolveAncestorPipeline = async (
  pipeline: PipelineStage[],
  projections: WeakMap<object, Record<string, unknown>>,
  session?: ClientSession,
) => {
  for (let index = 0; index < pipeline.length; index++) {
    const stage = pipeline[index];

    if ("$match" in stage) stage.$match = await resolveAncestorFilter(stage.$match, session);

    if ("$project" in stage) {
      projections.set(pipeline, { ...stage.$project });
      prepareAncestorProjection(stage.$project);

      if (!Object.keys(stage.$project).length) pipeline.splice(index--, 1);
    }

    if ("$facet" in stage) {
      for (const nested of Object.values(stage.$facet))
        await resolveAncestorPipeline(nested, projections, session);
    }
  }
};

const derivePipelineAncestors = async (
  documents: any[],
  pipeline: PipelineStage[],
  projections: WeakMap<object, Record<string, unknown>>,
  session?: ClientSession,
) => {
  const facet = [...pipeline].reverse().find((stage) => "$facet" in stage);

  if (facet && "$facet" in facet) {
    for (const document of documents) {
      for (const [key, nested] of Object.entries(facet.$facet)) {
        if (Array.isArray(document[key]))
          await derivePipelineAncestors(document[key], nested, projections, session);
      }
    }
  } else {
    await deriveSelectedAncestors(documents, projections.get(pipeline), session);
  }
};

/** Stored ancestor arrays are not authoritative: hierarchy changes never rewrite media records. */
export const mediaAncestryPlugin = (schema: Schema) => {
  const projections = new WeakMap<object, Record<string, unknown>>();

  schema.pre(
    /^(find|count|distinct|update|delete)/,
    async function (this: Query<unknown, unknown>) {
      this.setQuery(await resolveAncestorFilter(this.getFilter(), this.getOptions().session));

      const projection = this.projection();

      projections.set(this, projection && { ...projection });

      if (projection) {
        prepareAncestorProjection(projection);
        this.projection(projection);
      }
    },
  );

  schema.post(/^find/, async function (documents) {
    await deriveSelectedAncestors(documents, projections.get(this), this.getOptions().session);
  });

  schema.pre("aggregate", async function () {
    await resolveAncestorPipeline(this.pipeline(), projections, this.options.session);
  });

  schema.post("aggregate", async function (documents) {
    await derivePipelineAncestors(documents, this.pipeline(), projections, this.options.session);
  });
};

const deriveTagHierarchy = async (
  documents: any,
  projection: Record<string, unknown>,
  session?: ClientSession,
) => {
  const tags = (Array.isArray(documents) ? documents : [documents]).filter((tag) => tag?._id);

  if (!tags.length) return;

  for (const field of ["ancestorIds", "descendantIds"] as const) {
    if (!selectsField(projection, field)) continue;

    const related = new Map(
      (
        await getRelatedTags(
          tags.map((tag) => tag._id),
          field === "descendantIds",
          session,
        )
      ).map((tag) => [String(tag._id), tag.related]),
    );

    for (const tag of tags) tag[field] = related.get(String(tag._id)) ?? [];
  }
};

const resolveTagHierarchyFilter = async (filter: Record<string, any>, session?: ClientSession) =>
  resolveAncestorFilter(
    await resolveAncestorFilter(filter, session, "ancestorIds", "_id", true),
    session,
    "descendantIds",
    "_id",
    false,
  );

/** Direct relationships stay authoritative while queued hierarchy caches are rebuilt. */
export const tagAncestryPlugin = (schema: Schema) => {
  const projections = new WeakMap<object, Record<string, unknown>>();

  schema.pre(
    /^(find|count|distinct|update|delete)/,
    async function (this: Query<unknown, unknown>) {
      this.setQuery(await resolveTagHierarchyFilter(this.getFilter(), this.getOptions().session));

      const projection = this.projection();

      projections.set(this, projection && { ...projection });

      if (
        projection &&
        (projection._id === 0 || projection._id === false) &&
        (selectsField(projection, "ancestorIds") || selectsField(projection, "descendantIds"))
      ) {
        delete projection._id;
        this.projection(projection);
      }
    },
  );

  schema.post(/^find/, async function (documents) {
    if (this.getOptions().storedHierarchy) return;

    const projection = projections.get(this);

    await deriveTagHierarchy(documents, projection, this.getOptions().session);

    if (projection?._id === 0 || projection?._id === false) {
      for (const document of Array.isArray(documents) ? documents : [documents]) {
        if (!document) continue;

        if (typeof document.set === "function") document.set("_id", undefined);
        else delete document._id;
      }
    }
  });

  schema.pre("aggregate", async function () {
    for (const stage of this.pipeline()) {
      if ("$match" in stage)
        stage.$match = await resolveTagHierarchyFilter(stage.$match, this.options.session);
    }
  });

  schema.post("aggregate", async function (documents) {
    // Graph lookups and grouped results are not tag documents.
    await deriveTagHierarchy(
      documents.filter((tag) => Array.isArray(tag.parentIds) && Array.isArray(tag.childIds)),
      null,
      this.options.session,
    );
  });
};
