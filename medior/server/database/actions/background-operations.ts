import * as models from "medior/_generated/server/models";
import { fileLog } from "trabecula/utils/server";
import { dayjs, PromiseQueue } from "medior/utils/common";
import { leanModelToJson, makeAction, objectId, objectIds, socket } from "medior/utils/server";

const backgroundOperationMutationQueue = new PromiseQueue();

/* -------------------------------------------------------------------------- */
/*                              HELPER FUNCTIONS                              */
/* -------------------------------------------------------------------------- */
const emitBackgroundOperation = async (id: string) => {
  const operation = leanModelToJson<models.BackgroundOperationSchema>(
    await models.BackgroundOperationModel.findById(id).lean(),
  );
  socket.emit("onBackgroundOperationUpdated", { id, updates: operation });
  return operation;
};

const setBackgroundOperation = async (
  id: string,
  updates: Partial<
    Pick<
      models.BackgroundOperationSchema,
      "completedAt" | "error" | "message" | "processedCount" | "startedAt" | "status" | "totalCount"
    >
  >,
) => {
  await models.BackgroundOperationModel.updateOne(
    { _id: objectId(id) },
    { $set: { ...updates, dateModified: dayjs().toISOString() } },
  );
  return emitBackgroundOperation(id);
};

// @generator-ignore-export
export const completeBackgroundOperationTargets = async (
  id: string,
  targetIds: string[],
  message: string,
) => {
  let operation: models.BackgroundOperationSchema;

  backgroundOperationMutationQueue.add(async () => {
    await models.BackgroundOperationModel.updateOne(
      { _id: objectId(id) },
      {
        $inc: { processedCount: targetIds.length },
        $pullAll: { targetIds },
        $set: { dateModified: dayjs().toISOString(), message },
      },
    );
    operation = await emitBackgroundOperation(id);
  });

  await backgroundOperationMutationQueue.resolve();
  return operation;
};

// @generator-ignore-export
export const makeBackgroundOperationRunner = (label: string, processQueue: () => Promise<void>) => {
  let hasQueuedRun = false;
  let runPromise: Promise<void> = null;

  const run = () => {
    hasQueuedRun = true;
    if (runPromise) return runPromise;

    runPromise = (async () => {
      while (hasQueuedRun) {
        hasQueuedRun = false;
        await processQueue();
      }
    })()
      .catch((error) =>
        fileLog(`Failed to process queued ${label}: ${error.message}`, { type: "error" }),
      )
      .finally(() => {
        runPromise = null;
        if (hasQueuedRun) run();
      });
    return runPromise;
  };

  return run;
};

// @generator-ignore-export
export const queueBackgroundOperation = async ({
  label,
  targetIds,
  type,
}: {
  label: string;
  targetIds: string[];
  type: models.BackgroundOperationSchema["type"];
}) => {
  const uniqueTargetIds = [...new Set(targetIds)];
  if (!uniqueTargetIds.length) return null;

  let operation: models.BackgroundOperationSchema;

  backgroundOperationMutationQueue.add(async () => {
    const existing = await models.BackgroundOperationModel.findOne({
      status: { $in: ["PENDING", "RUNNING"] },
      type,
    });
    if (existing) {
      const mergedTargetIds = [...new Set([...existing.targetIds, ...uniqueTargetIds])];
      await models.BackgroundOperationModel.updateOne(
        { _id: existing._id },
        {
          $set: {
            dateModified: dayjs().toISOString(),
            targetIds: mergedTargetIds,
            totalCount: existing.processedCount + mergedTargetIds.length,
          },
        },
      );
      operation = await emitBackgroundOperation(existing._id.toString());
      return;
    }

    const now = dayjs().toISOString();
    operation = leanModelToJson<models.BackgroundOperationSchema>(
      (
        await models.BackgroundOperationModel.create({
          dateCreated: now,
          dateModified: now,
          label,
          processedCount: 0,
          status: "PENDING",
          targetIds: uniqueTargetIds,
          totalCount: uniqueTargetIds.length,
          type,
        })
      ).toObject(),
    );
    socket.emit("onBackgroundOperationUpdated", { id: operation.id, updates: operation });
  });

  await backgroundOperationMutationQueue.resolve();
  return operation;
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

/* -------------------------------------------------------------------------- */
/*                                API ENDPOINTS                               */
/* -------------------------------------------------------------------------- */
export const listBackgroundActivity = makeAction(async () => ({
  notifications: (
    await models.NotificationModel.find().sort({ dateCreated: -1 }).limit(250).lean()
  ).map((notification) => leanModelToJson<models.NotificationSchema>(notification)),
  operations: (
    await models.BackgroundOperationModel.find().sort({ dateCreated: -1 }).limit(100).lean()
  ).map((operation) => leanModelToJson<models.BackgroundOperationSchema>(operation)),
}));

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
