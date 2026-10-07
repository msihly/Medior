import { calculateObjectSize, EJSON } from "bson";
import type { BackgroundOperationSchema } from "medior/_generated/server/models";
import { setImmediate } from "timers/promises";
import { isDeepStrictEqual } from "util";
import {
  backgroundExecution,
  checkBackgroundExecution,
  runBackgroundExecution,
} from "medior/server/database/background-execution";
import { getBackgroundSession } from "medior/server/database/database-context";
import {
  IMPORT_ENTRY_CHECKPOINT_ID,
  IMPORT_ENTRY_MIGRATION_ID,
} from "medior/server/database/import-entry-state";
import {
  ensurePersistenceIndexes,
  isPersistenceReady,
  PERSISTENCE_MIGRATION_ID,
  PersistenceModel,
} from "medior/server/database/persistence";
import { isServerStopping } from "medior/server/process-lifecycle";
import { socket } from "medior/utils/server/trpc";

interface StoredRecord {
  _id: any;
  [key: string]: any;
}

interface MigrationCheckpoint extends StoredRecord {
  completedSources?: string[];
  copiedCount?: number;
  lastId?: any;
  source?: string;
  status?: BackgroundOperationSchema["status"];
}

export const PERSISTENCE_ACTIVITY_ID = "70657273697374656e636531";

const LEGACY_COLLECTIONS = {
  backgroundoperations: "BackgroundOperation",
  fileoperations: "FileOperation",
  imagecopypairs: "ImageCopyPair",
  imagecopyscans: "ImageCopyScan",
  mediaownerships: "MediaOwnership",
  metadatapayloads: "MetadataPayload",
  metadataworks: "MetadataWork",
  similaritybackfills: "SimilarityBackfill",
};
const MAX_PAGE_BYTES = 8 * 1024 * 1024;
const MAX_PAGE_RECORDS = 1000;
const WRITE_OPTIONS = { writeConcern: { j: true, w: "majority" as const } };
let migration: Promise<boolean>;
let migrationController: AbortController;
let lastProgressAt = 0;
let progress: BackgroundOperationSchema = {
  dateCreated: new Date().toISOString(),
  dateModified: new Date().toISOString(),
  id: PERSISTENCE_ACTIVITY_ID,
  label: "Recovery storage consolidation",
  message: "Preparing shared recovery storage. Library browsing remains available.",
  processedCount: 0,
  status: "PENDING",
  targetIds: [],
  totalCount: 0,
  type: "persistenceMigration",
};

export const getPersistenceMigrationProgress = () => ({ ...progress });

const updateProgress = (updates: Partial<BackgroundOperationSchema>) => {
  const now = new Date().toISOString();

  progress = {
    ...progress,
    ...updates,
    ...(updates.status ? { dismissedAt: updates.status === "COMPLETE" ? now : null } : {}),
    dateModified: now,
  };

  if (!isServerStopping() && (updates.status || performance.now() - lastProgressAt >= 1000)) {
    lastProgressAt = performance.now();
    socket.emitReliable("onBackgroundOperationUpdated", { id: progress.id, updates: progress });
  }
};

const writeCheckpoint = async (updates: Partial<MigrationCheckpoint>) => {
  await PersistenceModel.collection.updateOne(
    { _id: PERSISTENCE_MIGRATION_ID, recordType: "PersistenceMigration" },
    { $set: updates },
    { ...WRITE_OPTIONS, session: getBackgroundSession(), upsert: true },
  );
};

const consolidatePersistence = async (retry: boolean) => {
  // Load every auxiliary schema before building their shared collection indexes.
  await import("medior/server/database/metadata-payloads");
  await import("medior/server/database/similarity-backfill");
  await import("medior/server/lower-resolution");

  if (await isPersistenceReady()) return true;

  const execution = backgroundExecution.getStore();

  execution.label = "recovery storage consolidation";
  execution.operationId = PERSISTENCE_ACTIVITY_ID;

  const checkpoint = (await PersistenceModel.collection.findOne(
    { _id: PERSISTENCE_MIGRATION_ID, recordType: "PersistenceMigration" },
    { session: getBackgroundSession() },
  )) as MigrationCheckpoint;

  updateProgress({ processedCount: checkpoint?.copiedCount ?? 0 });

  if (!retry && ["CANCELLED", "ERROR"].includes(checkpoint?.status)) {
    updateProgress({
      error: checkpoint.error,
      message: "Retry to continue consolidation from the saved position.",
      status: checkpoint.status,
    });

    return false;
  }

  const completedSources = checkpoint?.completedSources ?? [];

  updateProgress({
    error: null,
    message: "Preparing shared recovery indexes...",
    status: "RUNNING",
  });

  await writeCheckpoint({ error: null, status: "RUNNING" });
  await ensurePersistenceIndexes();

  for (const [sourceName, recordType] of Object.entries(LEGACY_COLLECTIONS)) {
    checkBackgroundExecution();

    if (completedSources.includes(sourceName)) continue;

    const source = PersistenceModel.db.collection<StoredRecord>(sourceName);
    const lastId = checkpoint?.source === sourceName ? checkpoint.lastId : undefined;
    const cursor = source.find(
      lastId === undefined ? {} : { $expr: { $gt: ["$_id", { $literal: lastId }] } },
      {
        batchSize: 64,
        session: getBackgroundSession(),
        sort: { _id: 1 },
      },
    );
    let page: StoredRecord[] = [];
    let pageBytes = 0;

    const copyPage = async () => {
      if (!page.length) return;

      checkBackgroundExecution();
      updateProgress({
        message: `Consolidating ${sourceName}: ${progress.processedCount.toLocaleString()} records verified.`,
      });

      const records = page.map((document) => {
        if (recordType === "MetadataWork") {
          // This retired format has no active reader. Preserve it without colliding with job IDs.
          return { _id: { id: document._id, recordType }, data: document, recordType };
        } else {
          return {
            ...document,
            ...(recordType === "MetadataPayload"
              ? { ownerId: String(document._id).split(":")[0] }
              : {}),
            recordType,
          };
        }
      });

      // Repeating an interrupted page never overwrites another kind or newer state.
      await PersistenceModel.collection.bulkWrite(
        records.map((document) => ({
          updateOne: {
            filter: { _id: document._id, recordType },
            update: { $setOnInsert: document },
            upsert: true,
          },
        })),
        { ...WRITE_OPTIONS, ordered: false, session: getBackgroundSession() },
      );

      const copied = await PersistenceModel.collection
        .find(
          { _id: { $in: records.map((document) => document._id) }, recordType },
          { session: getBackgroundSession() },
        )
        .toArray();

      const byId = new Map(copied.map((document) => [EJSON.stringify(document._id), document]));

      for (const document of records) {
        if (!isDeepStrictEqual(document, byId.get(EJSON.stringify(document._id))))
          throw new Error(
            `Recovery record verification failed in ${sourceName}; its source collection was retained.`,
          );
      }

      checkBackgroundExecution();

      const copiedCount = progress.processedCount + records.length;

      await writeCheckpoint({ copiedCount, lastId: page[page.length - 1]._id, source: sourceName });
      updateProgress({ processedCount: copiedCount });
      page = [];
      pageBytes = 0;
      await setImmediate();
    };

    try {
      for await (const document of cursor) {
        checkBackgroundExecution();

        const bytes = calculateObjectSize(document);

        if (page.length && (pageBytes + bytes > MAX_PAGE_BYTES || page.length >= MAX_PAGE_RECORDS))
          await copyPage();

        page.push(document);
        pageBytes += bytes;
      }

      await copyPage();
      checkBackgroundExecution();

      try {
        await source.drop({ ...WRITE_OPTIONS, session: getBackgroundSession() });
      } catch (error) {
        if (error.code !== 26) throw error;
      }

      completedSources.push(sourceName);
      await writeCheckpoint({ completedSources });
    } finally {
      await cursor.close();
    }
  }

  checkBackgroundExecution();

  if (
    await PersistenceModel.collection.findOne({
      _id: IMPORT_ENTRY_MIGRATION_ID,
      recordType: "BackgroundOperation",
      status: "COMPLETE",
    })
  ) {
    await PersistenceModel.collection.updateOne(
      { _id: IMPORT_ENTRY_CHECKPOINT_ID, recordType: "Checkpoint" },
      { $set: { complete: true } },
      { ...WRITE_OPTIONS, session: getBackgroundSession(), upsert: true },
    );
  }

  await writeCheckpoint({ status: "COMPLETE" });
  updateProgress({ message: "Recovery storage consolidated.", status: "COMPLETE" });
  socket.emitReliable("onReloadBackgroundActivity");

  return isPersistenceReady();
};

/** Called after the API listener opens; readiness gates apply only to dependent work. */
export const runPersistenceMigration = (retry = false) => {
  if (!migration) {
    let execution: ReturnType<typeof backgroundExecution.getStore>;

    migrationController = new AbortController();
    migration = runBackgroundExecution(() => {
      execution = backgroundExecution.getStore();

      return consolidatePersistence(retry);
    }, migrationController.signal)
      .catch(async (error) => {
        if (isServerStopping()) {
          updateProgress({
            error: null,
            message: "Consolidation will resume after restart.",
            status: "PENDING",
          });
        } else {
          const status = migrationController.signal.aborted
            ? "CANCELLED"
            : execution?.cancelled
              ? "PENDING"
              : "ERROR";

          const message = status === "PENDING" ? null : error.message;

          updateProgress({ error: message, status });

          try {
            await writeCheckpoint({ error: message, status });
          } catch (checkpointError) {
            console.error("Failed to save consolidation status:", checkpointError);
          }
        }

        return false;
      })
      .finally(() => {
        migration = null;
      });
  }

  return migration;
};

export const cancelPersistenceMigration = async () => {
  migrationController?.abort();
  await migration;

  return getPersistenceMigrationProgress();
};
