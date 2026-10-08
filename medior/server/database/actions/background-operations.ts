import { randomUUID } from "crypto";
import * as models from "medior/_generated/server/models";
import { fileLog } from "trabecula/utils/server";
import {
  backgroundExecution,
  cancelBackgroundExecutions,
  runBackgroundExecution,
} from "medior/server/database/background-execution";
import {
  areMediaPathIndexesReady,
  pauseFileCleanups,
  recoverFileOperations,
} from "medior/server/database/file-operations";
import { areImportEntriesReady } from "medior/server/database/import-entry-state";
import { metadataWork } from "medior/server/database/metadata-context";
import { metadataMutation } from "medior/server/database/metadata-mutations";
import { metadataWriteOptions, resumeMetadataWork } from "medior/server/database/metadata-work";
import { isPersistenceReady } from "medior/server/database/persistence";
import {
  cancelPersistenceMigration,
  getPersistenceMigrationProgress,
  PERSISTENCE_ACTIVITY_ID,
  runPersistenceMigration,
} from "medior/server/database/persistence-migration";
import { pruneCompletedOperations } from "medior/server/database/persistence-retention";
import { cancelRepair, pauseRepairs } from "medior/server/database/repair-progress";
import { isServerStopping } from "medior/server/process-lifecycle";
import { dayjs } from "medior/utils/common";
import { leanModelToJson, makeAction, objectId, objectIds, socket } from "medior/utils/server";
import { vectorTrpc } from "medior/utils/server/trpc";
import { workSignal } from "medior/utils/server/work-signal";

const runners = new Map<() => Promise<void>, boolean>();

let backgroundQueuesRunning = false;
let queueControl = Promise.resolve<unknown>(undefined);
let retentionTimer: NodeJS.Timeout;
let stoppingQueues: Promise<void>;

const controlBackgroundQueues = <T>(run: () => Promise<T>) => {
  const result = queueControl.then(run, run);

  queueControl = result.catch(() => {});

  return result;
};

// @generator-ignore-export
export const canRunBackgroundQueues = () =>
  backgroundQueuesRunning && !isServerStopping() && !backgroundExecution.getStore()?.cancelled;

// @generator-ignore-export
export const stopBackgroundQueues = () => {
  backgroundQueuesRunning = false;
  clearInterval(retentionTimer);

  const stoppingCleanups = pauseFileCleanups();

  return (stoppingQueues ??= (async () => {
    await Promise.all([
      cancelBackgroundExecutions(),
      pauseRepairs(),
      stoppingCleanups,
      !isServerStopping() && vectorTrpc.pauseSimilarityBackfills.mutate(),
    ]);
  })().finally(() => {
    stoppingQueues = null;
  }));
};

/* -------------------------------------------------------------------------- */
/*                              HELPER FUNCTIONS                              */
/* -------------------------------------------------------------------------- */
// @generator-ignore-export
export const emitBackgroundOperation = async (id: string) => {
  // Activity only needs to know whether targets remain; the full queue stays in the database.
  const operation = leanModelToJson<models.BackgroundOperationSchema>(
    await models.BackgroundOperationModel.findById(id)
      .select({
        metadataScan: 0,
        targetIds: { $slice: 1 },
        targetVersions: 0,
        transformIds: 0,
        transformOptions: 0,
        work: 0,
      })
      .lean(),
  );

  socket.emit("onBackgroundOperationUpdated", { id, updates: operation });

  return operation;
};

const setBackgroundOperation = async (
  id: string,
  updates: Partial<
    Pick<
      models.BackgroundOperationSchema,
      | "completedAt"
      | "error"
      | "message"
      | "processedCount"
      | "startedAt"
      | "status"
      | "targetIds"
      | "totalCount"
    >
  >,
) => {
  if (updates.status === "RUNNING" && backgroundExecution.getStore())
    backgroundExecution.getStore().operationId = id;

  await models.BackgroundOperationModel.updateOne(
    {
      _id: objectId(id),
      ...(["ERROR", "RUNNING"].includes(updates.status)
        ? { status: { $in: ["PENDING", "RUNNING"] } }
        : {}),
    },
    {
      $set: { ...updates, dateModified: dayjs().toISOString() },
      ...(["CANCELLED", "COMPLETE", "ERROR"].includes(updates.status)
        ? { $unset: { queueKey: 1 } }
        : {}),
    },
    metadataWriteOptions(),
  );

  return emitBackgroundOperation(id);
};

// @generator-ignore-export
export const completeBackgroundOperationTargets = async (
  id: string,
  targetIds: string[],
  message: string,
  expectedVersions?: Record<string, string>,
) => {
  if (!targetIds.length) return emitBackgroundOperation(id);

  const completedTargets = {
    $setIntersection: [
      "$targetIds",
      expectedVersions
        ? {
            $concatArrays: targetIds.map((targetId) => ({
              $cond: [
                {
                  $eq: [
                    { $ifNull: [`$targetVersions.${targetId}`, null] },
                    expectedVersions[targetId] ?? null,
                  ],
                },
                { $literal: [targetId] },
                [],
              ],
            })),
          }
        : { $literal: targetIds },
    ],
  };

  await models.BackgroundOperationModel.updateOne(
    { _id: objectId(id), status: { $in: ["PENDING", "RUNNING"] } },
    [
      {
        $replaceWith: {
          $let: {
            vars: { completedTargets },
            in: {
              $mergeObjects: [
                "$$ROOT",
                {
                  dateModified: dayjs().toISOString(),
                  message: { $literal: message },
                  processedCount: { $add: ["$processedCount", { $size: "$$completedTargets" }] },
                  targetIds: { $setDifference: ["$targetIds", "$$completedTargets"] },
                  targetVersions: {
                    $arrayToObject: {
                      $filter: {
                        input: { $objectToArray: { $ifNull: ["$targetVersions", {}] } },
                        as: "entry",
                        cond: { $not: [{ $in: ["$$entry.k", "$$completedTargets"] }] },
                      },
                    },
                  },
                },
              ],
            },
          },
        },
      },
    ],
    metadataWriteOptions(),
  );

  return emitBackgroundOperation(id);
};

// @generator-ignore-export
export const makeBackgroundOperationRunner = (
  label: string,
  processQueue: () => Promise<void>,
  requiresMediaPaths = true,
) => {
  let hasQueuedRun = false;
  let runPromise: Promise<void> = null;

  const run = () => {
    return metadataMutation.exit(() =>
      metadataWork.exit(() =>
        backgroundExecution.exit(() =>
          workSignal.exit(() => {
            if (!canRunBackgroundQueues()) return Promise.resolve();

            hasQueuedRun = true;

            if (runPromise) return runPromise;

            let execution: ReturnType<typeof backgroundExecution.getStore>;

            runPromise = runBackgroundExecution(async () => {
              execution = backgroundExecution.getStore();
              execution.label = label;
              execution.resumeQueue = async () => {
                await runPromise;

                return run();
              };

              if (!(await isPersistenceReady())) {
                hasQueuedRun = false;

                return;
              }

              if (requiresMediaPaths && !(await areMediaPathIndexesReady())) {
                hasQueuedRun = false;

                return;
              }

              while (hasQueuedRun && canRunBackgroundQueues()) {
                hasQueuedRun = false;
                await processQueue();
              }
            })
              .catch(async (error) => {
                if (!canRunBackgroundQueues() || execution?.cancelled) return;

                const message = `Failed to process queued ${label}: ${error?.message ?? String(error)}`;

                fileLog(message, { type: "error" });

                if (execution?.operationId) {
                  try {
                    await setBackgroundOperationStatus(execution.operationId, "ERROR", {
                      error: message,
                    });
                  } catch (statusError) {
                    console.error("Failed to save background operation error:", statusError);
                  }
                }

                const notification = await recordNotification({ message, type: "error" });

                if (!notification.success)
                  console.error("Failed to report background operation error:", notification.error);
              })
              .finally(() => {
                runPromise = null;

                if (hasQueuedRun && !execution?.cancelled) run();
              });

            return runPromise;
          }),
        ),
      ),
    );
  };

  runners.set(run, requiresMediaPaths);

  return run;
};

// @generator-ignore-export
export const runFileCleanupQueue = makeBackgroundOperationRunner("file cleanup", () =>
  recoverFileOperations(canRunBackgroundQueues),
);

// @generator-ignore-export
export const runMetadataRecoveryQueue = makeBackgroundOperationRunner(
  "metadata recovery",
  async () => {
    if (await areImportEntriesReady()) await resumeMetadataWork(canRunBackgroundQueues);
  },
);

makeBackgroundOperationRunner(
  "media path indexing",
  async () => {
    const { runMediaPathIndexQueue } = await import("medior/server/database/media-path-index");

    if (!(await runMediaPathIndexQueue()) || !canRunBackgroundQueues()) return;

    await import("medior/server/database/import-audio");

    for (const [run, requiresMediaPaths] of runners) {
      if (requiresMediaPaths) run();
    }
  },
  false,
);

makeBackgroundOperationRunner(
  "import history upgrade",
  async () => {
    const { runImportEntryMigrationQueue } = await import(
      "medior/server/database/import-entry-migration"
    );

    if (!(await runImportEntryMigrationQueue()) || !canRunBackgroundQueues()) return;

    runMetadataRecoveryQueue();
  },
  false,
);

// @generator-ignore-export
export const startBackgroundQueues = async (retryPersistence = false) => {
  if (isServerStopping()) return;

  backgroundQueuesRunning = true;

  try {
    const ready = await runPersistenceMigration(retryPersistence);

    if (!ready || !canRunBackgroundQueues()) return;

    // Media path indexing starts its dependent queues once their indexes are ready.
    for (const [run, requiresMediaPaths] of runners) {
      if (!requiresMediaPaths) run();
    }

    clearInterval(retentionTimer);
    retentionTimer = setInterval(() => runPersistenceRetention(), 60 * 1000);
    retentionTimer.unref();
  } catch (error) {
    console.error("Recovery storage consolidation failed:", error);
  }
};

const runPersistenceRetention = makeBackgroundOperationRunner(
  "completed activity cleanup",
  pruneCompletedOperations,
  false,
);

// @generator-ignore-export
export const queueBackgroundOperation = async ({
  label,
  targetIds,
  type,
  queueKey = type,
}: {
  label: string;
  queueKey?: string;
  targetIds: string[];
  type: models.BackgroundOperationSchema["type"];
}) => {
  const uniqueTargetIds = [...new Set(targetIds)];

  if (!uniqueTargetIds.length) return null;

  const now = dayjs().toISOString();

  const source = metadataWork.getStore()
    ? `${metadataWork.getStore().name} (${metadataWork.getStore().id})`
    : (backgroundExecution.getStore()?.label ?? "foreground request");

  const version = randomUUID();

  let operation: models.BackgroundOperationSchema = null;

  for (let attempt = 0; attempt < 10; attempt++) {
    let selectedQueueKey = queueKey;

    if (type === "tagMetadata") {
      const keys = [queueKey, `${queueKey}:next`];

      const active = await models.BackgroundOperationModel.findOne({
        queueKey: { $in: keys },
        status: { $in: ["PENDING", "RUNNING"] },
      })
        .select({ queueKey: 1 })
        .sort({ status: -1, dateCreated: 1 })
        .lean();

      selectedQueueKey = active?.queueKey ?? queueKey;
    }

    try {
      operation = leanModelToJson<models.BackgroundOperationSchema>(
        await models.BackgroundOperationModel.findOneAndUpdate(
          {
            queueKey: selectedQueueKey,
          },
          [
            {
              $set: {
                completedAt: null,
                dateCreated: { $ifNull: ["$dateCreated", now] },
                dateModified: now,
                error: null,
                label: { $literal: label },
                processedCount: {
                  $cond: [{ $in: ["$status", ["PENDING", "RUNNING"]] }, "$processedCount", 0],
                },
                queueKey: selectedQueueKey,
                source: { $literal: source },
                status: {
                  $cond: [{ $eq: ["$status", "RUNNING"] }, "RUNNING", "PENDING"],
                },
                targetIds: {
                  $concatArrays: [
                    { $ifNull: ["$targetIds", []] },
                    {
                      $setDifference: [
                        { $literal: uniqueTargetIds },
                        { $ifNull: ["$targetIds", []] },
                      ],
                    },
                  ],
                },
                targetVersions: {
                  $mergeObjects: [
                    { $ifNull: ["$targetVersions", {}] },
                    { $literal: Object.fromEntries(uniqueTargetIds.map((id) => [id, version])) },
                  ],
                },
                type,
              },
            },
            { $set: { totalCount: { $add: ["$processedCount", { $size: "$targetIds" }] } } },
          ],
          { new: true, upsert: true, ...metadataWriteOptions() },
        ).lean(),
      );
      break;
    } catch (error) {
      if (type !== "tagMetadata" || error.code !== 11000) throw error;
    }
  }

  if (!operation) throw new Error(`Could not queue ${type} after concurrent updates`);

  if (type === "tagMetadata" && operation.dateCreated === now)
    fileLog(
      `[Tag metadata ${operation.id}] Created for ${uniqueTargetIds.length} tags by ${source}.`,
    );

  socket.emit("onBackgroundOperationUpdated", {
    id: operation.id,
    updates: {
      ...operation,
      targetIds: operation.targetIds.slice(0, 1),
      targetVersions: undefined,
    },
  });

  return operation;
};

// @generator-ignore-export
export const mergeTagMetadataQueues = async (operation: models.BackgroundOperationSchema) => {
  const pending = await models.BackgroundOperationModel.find({
    _id: { $ne: objectId(operation.id) },
    queueKey: { $in: ["tagMetadata", "tagMetadata:next"] },
    status: "PENDING",
    type: "tagMetadata",
  }).lean();

  for (const queued of pending) {
    if (queued.targetIds.length) {
      const merged = await queueBackgroundOperation({
        label: operation.label,
        targetIds: queued.targetIds,
        type: "tagMetadata",
      });

      if (merged?.id !== operation.id) return true;
    }

    // Transfer first. If the pending queue changes meanwhile, leave it available for another merge.
    await models.BackgroundOperationModel.updateOne(
      {
        _id: queued._id,
        status: "PENDING",
        targetIds: queued.targetIds,
        targetVersions: queued.targetVersions ?? { $exists: false },
      },
      {
        $set: {
          completedAt: dayjs().toISOString(),
          dateModified: dayjs().toISOString(),
          message: "Remaining tags merged into the active metadata regeneration.",
          processedCount: queued.totalCount,
          status: "COMPLETE",
          targetIds: [],
          targetVersions: {},
        },
        $unset: { queueKey: 1 },
      },
      metadataWriteOptions(),
    );

    await emitBackgroundOperation(String(queued._id));
  }

  return pending.length > 0;
};

// @generator-ignore-export
export const setBackgroundOperationStatus = async (
  id: string,
  status: models.BackgroundOperationSchema["status"],
  updates: Partial<models.BackgroundOperationSchema> = {},
) =>
  setBackgroundOperation(id, {
    ...updates,
    ...(status === "RUNNING" ? { startedAt: dayjs().toISOString() } : {}),
    ...(["CANCELLED", "COMPLETE", "ERROR"].includes(status)
      ? { completedAt: dayjs().toISOString() }
      : {}),
    status,
  });

// @generator-ignore-export
export const completeEmptyBackgroundOperation = async (id: string, message: string) => {
  await models.BackgroundOperationModel.updateOne(
    { _id: id, status: { $in: ["PENDING", "RUNNING"] }, targetIds: { $size: 0 } },
    [
      {
        $set: {
          completedAt: dayjs().toISOString(),
          dateModified: dayjs().toISOString(),
          message,
          processedCount: "$totalCount",
          status: "COMPLETE",
        },
      },
      { $unset: "queueKey" },
    ],
    metadataWriteOptions(),
  );

  await emitBackgroundOperation(id);
};

/* -------------------------------------------------------------------------- */
/*                                API ENDPOINTS                               */
/* -------------------------------------------------------------------------- */
export const listBackgroundActivity = makeAction(async () => {
  const notifications = (
    await models.NotificationModel.find().sort({ dateCreated: -1 }).limit(250).lean()
  ).map((notification) => leanModelToJson<models.NotificationSchema>(notification));

  if (!(await isPersistenceReady())) {
    return {
      notifications,
      operations: [getPersistenceMigrationProgress()],
    };
  } else {
    const { ensureMediaPathIndexOperation } = await import(
      "medior/server/database/media-path-index"
    );

    await ensureMediaPathIndexOperation();

    // These requests stopped before any repair writes; retrying each cannot unblock indexing.
    await models.BackgroundOperationModel.updateMany(
      {
        dismissedAt: null,
        error: /^Media path indexing is incomplete/,
        status: "ERROR",
        type: "metadataAction",
        "work.name": "repairFileThumbnail",
      },
      { $set: { dateModified: dayjs().toISOString(), dismissedAt: dayjs().toISOString() } },
      metadataWriteOptions(),
    );

    const actionable = { status: { $in: ["PENDING", "RUNNING", "CANCELLED", "ERROR"] } };
    const prerequisiteTypes = ["importEntryMigration", "mediaPathIndex"];

    const operations = await Promise.all(
      [
        { ...actionable, type: { $in: prerequisiteTypes } },
        { status: { $in: ["PENDING", "RUNNING"] }, type: { $nin: prerequisiteTypes } },
        { status: { $in: ["CANCELLED", "ERROR"] }, type: { $nin: prerequisiteTypes } },
        {
          $nor: [actionable],
          $or: [{ type: { $ne: "metadataAction" } }, { status: { $ne: "COMPLETE" } }],
        },
      ].map((filter) =>
        models.BackgroundOperationModel.find({ $and: [filter, { dismissedAt: null }] })
          .select({
            metadataScan: 0,
            targetIds: { $slice: 1 },
            targetVersions: 0,
            transformIds: 0,
            transformOptions: 0,
            work: 0,
          })
          .sort({ dateCreated: -1, _id: -1 })
          .limit(100)
          .lean(),
      ),
    );

    return {
      notifications,
      operations: operations
        .flat()
        .slice(0, 100)
        .map((operation) => leanModelToJson<models.BackgroundOperationSchema>(operation)),
    };
  }
});

export const retryBackgroundOperation = makeAction(({ id }: { id: string }) =>
  controlBackgroundQueues(async () => {
    if (isServerStopping()) throw new Error("Server is shutting down");

    if (id === PERSISTENCE_ACTIVITY_ID) {
      startBackgroundQueues(true);
    } else {
      const operation = await models.BackgroundOperationModel.findById(id).lean();

      if (!operation) throw new Error("Background operation not found");

      if (operation.type === "repair")
        throw new Error("Restart repairs from Settings to select the repair options");

      if (!["CANCELLED", "ERROR"].includes(operation.status))
        throw new Error("Only failed or cancelled operations can be retried");

      if (
        ["importEntryMigration", "mediaPathIndex", "metadataAction", "transformQueue"].includes(
          operation.type,
        )
      ) {
        await setBackgroundOperationStatus(id, "PENDING", {
          completedAt: null,
          error: null,
          message: "Continuing from the saved position.",
        });
      } else {
        if (!operation.targetIds.length)
          throw new Error("This operation has no remaining work to retry");

        await queueBackgroundOperation({
          label: operation.label,
          queueKey: operation.type === "duplicateMerge" ? `duplicateMerge:${id}` : operation.type,
          targetIds: operation.targetIds,
          type: operation.type,
        });

        await setBackgroundOperationStatus(id, "CANCELLED", {
          message: "Remaining work was requeued.",
          targetIds: [],
        });
      }

      startBackgroundQueues();
    }
  }),
);

export const cancelBackgroundOperation = makeAction(async ({ id }: { id: string }) => {
  console.info(`[Background operation ${id}] Cancel received.`);

  if (id === PERSISTENCE_ACTIVITY_ID) {
    return cancelPersistenceMigration();
  } else {
    const stopping = cancelBackgroundExecutions(id);

    const saved = (async () => {
      const operation = await models.BackgroundOperationModel.findById(id)
        .select({ targetIds: 1, type: 1 })
        .lean();

      if (!operation) throw new Error("Background operation not found");

      if (operation.type === "repair") await cancelRepair(operation.targetIds[0]);
      else {
        await models.BackgroundOperationModel.updateOne(
          { _id: objectId(id), status: { $in: ["PENDING", "RUNNING"] } },
          {
            $set: {
              completedAt: dayjs().toISOString(),
              dateModified: dayjs().toISOString(),
              status: "CANCELLED",
            },
            $unset: { queueKey: 1 },
          },
          metadataWriteOptions(),
        );
      }

      const result = await emitBackgroundOperation(id);

      if (!result) throw new Error("Background operation not found");

      return result;
    })();

    // Persist and acknowledge cancellation independently of the server's interrupt response.
    (async () => {
      try {
        const [resumes] = await Promise.all([stopping, saved]);

        for (const resume of resumes) resume();
      } catch (error) {
        console.error(`Background operation ${id} cancellation failed:`, error);
      }
    })();

    return saved;
  }
});

export const dismissBackgroundOperation = makeAction(async ({ id }: { id: string }) => {
  if (id === PERSISTENCE_ACTIVITY_ID)
    throw new Error("Recovery storage consolidation must finish before it can be dismissed.");

  const result = await models.BackgroundOperationModel.updateOne(
    {
      $or: [{ type: { $ne: "importEntryMigration" } }, { status: "COMPLETE" }],
      _id: objectId(id),
      status: { $in: ["CANCELLED", "COMPLETE", "ERROR"] },
    },
    { $set: { dateModified: dayjs().toISOString(), dismissedAt: dayjs().toISOString() } },
    metadataWriteOptions(),
  );

  if (!result.matchedCount)
    throw new Error(
      "Cancel running work before dismissing it. The import history upgrade must finish before it can be dismissed.",
    );

  return emitBackgroundOperation(id);
});

export const markNotificationsRead = makeAction(async ({ ids }: { ids: string[] }) => {
  if (!ids.length) return;

  await models.NotificationModel.updateMany(
    { _id: { $in: objectIds(ids) } },
    { $set: { isRead: true } },
  );

  socket.emit("onNotificationsRead", { ids });
});

export const recordNotification = makeAction(
  async ({ message, type }: { message: string; type: models.NotificationSchema["type"] }) => {
    const notification = leanModelToJson<models.NotificationSchema>(
      (
        await models.NotificationModel.create({
          dateCreated: dayjs().toISOString(),
          isRead: false,
          message,
          type,
        })
      ).toObject(),
    );

    socket.emit("onNotificationCreated", notification);

    return notification;
  },
);
