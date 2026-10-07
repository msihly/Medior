import { BackgroundOperationModel } from "medior/_generated/server/models";
import { checkBackgroundExecution } from "medior/server/database/background-execution";
import { getBackgroundSession } from "medior/server/database/database-context";
import { assertPersistenceReady, PersistenceModel } from "medior/server/database/persistence";
import { socket } from "medior/utils/server/trpc";

/** Retain recovery state; discard successful activity and its payloads after one day. */
export const pruneCompletedOperations = async () => {
  await assertPersistenceReady();

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const filter = {
    $or: [{ completedAt: { $lt: cutoff } }, { completedAt: null, dateModified: { $lt: cutoff } }],
    status: "COMPLETE",
  };
  const options = {
    session: getBackgroundSession(),
    writeConcern: { j: true, w: "majority" as const },
  };
  let removedCount = 0;

  while (true) {
    checkBackgroundExecution();

    const operations = await BackgroundOperationModel.find(filter)
      .select({ _id: 1 })
      .limit(100)
      .lean();

    if (!operations.length) break;

    // Keep the head until its payloads are removed so interruption repeats a complete cleanup.
    await PersistenceModel.collection.deleteMany(
      { ownerId: { $in: operations.map(({ _id }) => String(_id)) }, recordType: "MetadataPayload" },
      options,
    );

    checkBackgroundExecution();

    const result = await BackgroundOperationModel.deleteMany(
      { ...filter, _id: { $in: operations.map(({ _id }) => _id) } },
      options,
    );

    removedCount += result.deletedCount;
  }

  if (removedCount) socket.emitReliable("onReloadBackgroundActivity");
};
