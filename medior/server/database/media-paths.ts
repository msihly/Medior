import path from "path";
import { createHash } from "crypto";
import { models, Query, Schema } from "mongoose";

let mediaIndexVersion: string;

export const getMediaIndexVersion = () =>
  (mediaIndexVersion ??= `media-path-indexes:${createHash("sha256")
    .update(JSON.stringify(MEDIA_PATH_FIELDS))
    .update(
      JSON.stringify(
        Object.keys(models)
          .sort()
          .map((name) => [name, models[name].schema.indexes()]),
      ),
    )
    .digest("hex")}`);

export const MEDIA_PATH_FIELDS = {
  File: { path: "pathKey", "thumb.path": "thumbPathKey" },
  FileOperation: {
    outputPath: "outputPathKey",
    tempPath: "tempPathKey",
    thumbPath: "thumbPathKey",
  },
  FileTransform: {
    afterPath: "afterPathKey",
    beforePath: "beforePathKey",
    outputTempPath: "outputTempPathKey",
  },
  Tag: { "thumb.path": "thumbPathKey" },
};

export const mediaPathKey = (filePath?: string) =>
  filePath ? path.resolve(filePath).toLowerCase() : null;

export const readMediaPath = (document: Record<string, any>, field: string) =>
  field in document
    ? document[field]
    : field.split(".").reduce((value, key) => value?.[key], document);

export const getMediaPathKeys = (
  document: Record<string, any>,
  fields: Record<string, string>,
  partial = false,
) =>
  Object.fromEntries(
    Object.entries(fields)
      .filter(
        ([field]) =>
          !partial ||
          field
            .split(".")
            .some((_, index, parts) => document[parts.slice(0, index + 1).join(".")] !== undefined),
      )
      .map(([field, key]) => [key, mediaPathKey(readMediaPath(document, field))]),
  );

const normalizeMediaPathUpdate = (update: Record<string, any>, fields: Record<string, string>) => {
  if (Array.isArray(update)) {
    for (const stage of update) {
      if (Object.keys(getMediaPathKeys(stage.$set ?? stage.$addFields ?? {}, fields, true)).length)
        throw new Error("Media path updates must use document operators.");
    }

    return update;
  }

  for (const values of [update, update.$set, update.$setOnInsert].filter(Boolean))
    Object.assign(values, getMediaPathKeys(values, fields, true));

  if (update.$unset) {
    for (const [field, key] of Object.entries(fields)) {
      if (
        field
          .split(".")
          .some((_, index, parts) => parts.slice(0, index + 1).join(".") in update.$unset)
      )
        update.$unset[key] = 1;
    }
  }

  return update;
};

/** Mongoose bulk writes skip save and query middleware. Keep their derived keys in the same write. */
export const normalizeMediaPathWrites = <T>(
  modelName: keyof typeof MEDIA_PATH_FIELDS,
  writes: T[],
): T[] => {
  for (const write of writes) {
    for (const [type, operation] of Object.entries(write) as Array<[string, Record<string, any>]>) {
      if (type === "insertOne")
        Object.assign(
          operation.document,
          getMediaPathKeys(operation.document, MEDIA_PATH_FIELDS[modelName]),
        );
      else if (type === "replaceOne")
        Object.assign(
          operation.replacement,
          getMediaPathKeys(operation.replacement, MEDIA_PATH_FIELDS[modelName]),
        );
      else if (type === "updateMany" || type === "updateOne")
        normalizeMediaPathUpdate(operation.update, MEDIA_PATH_FIELDS[modelName]);
    }
  }

  return writes;
};

/** Path keys are stored with their source fields and use ordinary equality indexes. */
export const mediaPathPlugin = (
  schema: Schema,
  { modelName }: { modelName: keyof typeof MEDIA_PATH_FIELDS },
) => {
  const fields = MEDIA_PATH_FIELDS[modelName];

  for (const key of Object.values(fields)) {
    schema.add({ [key]: { select: false, type: String } });
    schema.index({ [key]: 1 }, { partialFilterExpression: { [key]: { $type: "string" } } });
  }

  schema.pre("save", function (next) {
    this.set(
      getMediaPathKeys(
        this,
        Object.fromEntries(
          Object.entries(fields).filter(([field]) => this.isNew || this.isModified(field)),
        ),
      ),
    );
    next();
  });

  schema.pre("insertMany", function (next, documents) {
    for (const document of documents) Object.assign(document, getMediaPathKeys(document, fields));

    next();
  });

  schema.pre(
    /^(findOneAnd(?:Replace|Update)|replaceOne|update)/,
    function (this: Query<unknown, unknown>, next) {
      normalizeMediaPathUpdate(this.getUpdate(), fields);
      next();
    },
  );
};
