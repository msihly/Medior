import { IndexDefinition, IndexOptions, Model, model, mongo, Schema } from "mongoose";
import { checkBackgroundExecution } from "medior/server/database/background-execution";
import { getBackgroundSession } from "medior/server/database/database-context";

export const PERSISTENCE_MIGRATION_ID = "persistence:consolidation:v1";

export type PersistenceRecordType =
  | "BackgroundOperation"
  | "DuplicateDismissal"
  | "FileOperation"
  | "ImageCopyMatch"
  | "ImageCopyPair"
  | "ImageCopyScan"
  | "MediaOwnership"
  | "MetadataPayload"
  | "SimilarityBackfill";

const schema = new Schema(
  {},
  {
    autoCreate: false,
    autoIndex: false,
    discriminatorKey: "recordType",
    writeConcern: { j: true, w: "majority" },
  },
);

/** All auxiliary state shares this collection; domain schemas are typed views of it. */
export const PersistenceModel = model("Persistence", schema, "persistence");

export const persistenceCollection = PersistenceModel.collection as unknown as mongo.Collection<{
  _id: string | mongo.ObjectId;
}>;

let persistenceReady = false;

export const isPersistenceReady = async () => {
  if (!persistenceReady) {
    const checkpoint = await persistenceCollection.findOne(
      { _id: PERSISTENCE_MIGRATION_ID, recordType: "PersistenceMigration", status: "COMPLETE" },
      { projection: { _id: 1 }, session: getBackgroundSession() },
    );

    persistenceReady = !!checkpoint;
  }

  return persistenceReady;
};

export const assertPersistenceReady = async () => {
  if (!(await isPersistenceReady()))
    throw new Error(
      "Recovery storage is being consolidated in the background. Check Activity for progress or Retry. Library browsing remains available.",
    );
};

export const registerPersistenceModel = <T>(
  name: PersistenceRecordType,
  recordSchema: Schema<T>,
) => {
  recordSchema.set("autoCreate", false);
  recordSchema.set("autoIndex", false);
  recordSchema.set("writeConcern", { j: true, w: "majority" });
  recordSchema.pre(/^(find|count|distinct|update|delete|replace)/, assertPersistenceReady);
  recordSchema.pre("aggregate", assertPersistenceReady);
  recordSchema.pre("insertMany", assertPersistenceReady);
  recordSchema.pre("save", assertPersistenceReady);

  return PersistenceModel.discriminator<T, Model<T, any, any, any>>(
    name,
    recordSchema,
  ) as unknown as Model<T>;
};

/** The driver accepts only a boolean `unique`, not mongoose's `[true, message]` form. */
export const toCreateIndexOptions = <T extends IndexOptions>({ unique, ...options }: T) => ({
  ...options,
  ...(unique !== undefined ? { unique: Array.isArray(unique) ? unique[0] : unique } : {}),
});

/** Shared-collection indexes must isolate both lookups and uniqueness by record type. */
export const ensurePersistenceIndexes = async () => {
  checkBackgroundExecution();

  await PersistenceModel.collection.createIndex(
    { recordType: 1, _id: 1 },
    { session: getBackgroundSession() },
  );

  for (const [name, recordModel] of Object.entries(PersistenceModel.discriminators ?? {}) as Array<
    [PersistenceRecordType, Model<unknown>]
  >) {
    for (const [keys, options] of recordModel.schema.indexes() as unknown as Array<
      [IndexDefinition, IndexOptions]
    >) {
      checkBackgroundExecution();

      if (options.sparse)
        throw new Error(
          `Persistence index ${name} (${Object.keys(keys).join(", ")}) must define an explicit partial filter instead of sparse.`,
        );

      const indexOptions = toCreateIndexOptions<IndexOptions & { _autoIndex?: boolean }>(options);

      delete indexOptions._autoIndex;
      delete indexOptions.sparse;

      await PersistenceModel.collection.createIndex(
        { recordType: 1, ...keys },
        {
          ...indexOptions,
          name: `${name}_${options.name ?? Object.entries(keys).flat().join("_")}`,
          partialFilterExpression: { ...options.partialFilterExpression, recordType: name },
          session: getBackgroundSession(),
        },
      );
    }
  }
};
