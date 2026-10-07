import { createHash } from "crypto";
import { BackgroundOperationModel } from "medior/_generated/server/models";
import { Collection, IndexOptions, models } from "mongoose";
import { setImmediate } from "timers/promises";
import {
  emitBackgroundOperation,
  setBackgroundOperationStatus,
} from "medior/server/database/actions/background-operations";
import {
  backgroundExecution,
  checkBackgroundExecution,
} from "medior/server/database/background-execution";
import {
  areMediaPathIndexesReady,
  MediaOwnershipModel,
} from "medior/server/database/file-operations";
import {
  getMediaIndexVersion,
  getMediaPathKeys,
  MEDIA_PATH_FIELDS,
  readMediaPath,
} from "medior/server/database/media-paths";
import { getBackgroundSession, metadataWriteOptions } from "medior/server/database/metadata-work";
import { ensurePersistenceIndexes, PersistenceModel } from "medior/server/database/persistence";
import { dayjs } from "medior/utils/common";
import { objectId } from "medior/utils/server";

const INDEX_SCAN_SIZE = 10000;
const INDEX_WRITE_SIZE = 1000;

const publishIndexProgress = async (id: string) => {
  const checkpoints = await MediaOwnershipModel.find({
    _id: {
      $in: Object.keys(models).map(
        (name) => `media-path-progress:${name}:${JSON.stringify(MEDIA_PATH_FIELDS[name] ?? {})}`,
      ),
    },
  })
    .select({ processedCount: 1 })
    .lean();

  await BackgroundOperationModel.updateOne(
    { _id: id },
    {
      $set: {
        processedCount: checkpoints.reduce(
          (total, checkpoint) => total + (checkpoint.processedCount ?? 0),
          0,
        ),
      },
    },
    metadataWriteOptions(),
  );

  await emitBackgroundOperation(id);
};

/** Persist the descriptor before background index construction and record updates. */
export const ensureMediaPathIndexOperation = async () => {
  if (await areMediaPathIndexesReady()) return null;

  const id = objectId(
    createHash("sha256").update(getMediaIndexVersion()).digest("hex").slice(0, 24),
  );

  const operation = await BackgroundOperationModel.findById(id).lean();

  if (operation) return operation;

  return BackgroundOperationModel.findOneAndUpdate(
    { _id: id },
    {
      $setOnInsert: {
        dateCreated: dayjs().toISOString(),
        dateModified: dayjs().toISOString(),
        label: "Media path indexing",
        message: "Media path indexing is queued. Browsing remains available.",
        processedCount: 0,
        status: "PENDING",
        targetIds: Object.keys(models).sort(),
        totalCount: 0,
        type: "mediaPathIndex",
      },
    },
    { new: true, upsert: true },
  ).lean();
};

/** Save checkpoints after idempotent writes so interrupted batches can be repeated. */
export const runMediaPathIndexQueue = async () => {
  const operation = await ensureMediaPathIndexOperation();

  if (!operation) return true;

  if (!["PENDING", "RUNNING"].includes(operation.status)) return false;

  const id = operation._id.toString();
  let lastProgressAt = 0;

  try {
    await setBackgroundOperationStatus(id, "RUNNING", { error: null });

    for (const name of operation.targetIds) {
      checkBackgroundExecution();

      const fields: Record<string, string> = MEDIA_PATH_FIELDS[name] ?? {};
      const progressId = `media-path-progress:${name}:${JSON.stringify(fields)}`;
      const indexVersion = JSON.stringify(models[name].schema.indexes());
      const progress = await MediaOwnershipModel.findById(progressId).lean();

      if (name === PersistenceModel.modelName) await ensurePersistenceIndexes();

      if (
        progress?.indexVersion !== indexVersion &&
        models[name].collection.name !== PersistenceModel.collection.name
      ) {
        await setBackgroundOperationStatus(id, "RUNNING", {
          message: `Ensuring indexes for ${name}. Pause interrupts this task.`,
        });

        for (const [keys, options] of models[name].schema.indexes() as unknown as Array<
          [Parameters<Collection["createIndex"]>[0], IndexOptions]
        >) {
          checkBackgroundExecution();

          await models[name].collection.createIndex(keys, {
            ...options,
            session: backgroundExecution.getStore()?.session,
          });
        }

        checkBackgroundExecution();

        await MediaOwnershipModel.updateOne(
          { _id: progressId },
          { $set: { indexVersion } },
          { session: backgroundExecution.getStore()?.session, upsert: true },
        );
      }

      while (true) {
        await setImmediate();
        checkBackgroundExecution();

        const checkpoint = await MediaOwnershipModel.findById(progressId).lean();

        if (checkpoint?.complete || !Object.keys(fields).length) break;

        const documents = await models[name]
          .find(checkpoint?.lastId ? { _id: { $gt: checkpoint.lastId } } : {})
          .select(
            Object.fromEntries(
              [...Object.keys(fields), ...Object.values(fields)].map((field) => [field, 1]),
            ),
          )
          .sort({ _id: 1 })
          .hint(
            models[name].collection.name === PersistenceModel.collection.name
              ? { recordType: 1, _id: 1 }
              : { _id: 1 },
          )
          .limit(INDEX_SCAN_SIZE)
          .lean();

        if (!documents.length) break;

        let processedCount = checkpoint?.processedCount ?? 0;
        let retryScan = false;

        for (let offset = 0; offset < documents.length; offset += INDEX_WRITE_SIZE) {
          const batch = documents.slice(offset, offset + INDEX_WRITE_SIZE);
          const writes = [];

          for (let index = 0; index < batch.length; index++) {
            if (index % 250 === 0) await setImmediate();

            checkBackgroundExecution();

            const document = batch[index];
            const keys = getMediaPathKeys(document, fields);

            if (Object.entries(keys).every(([key, value]) => document[key] === value)) continue;

            writes.push({
              updateOne: {
                filter: {
                  _id: document._id,
                  ...Object.fromEntries(
                    Object.keys(fields).map((field) => [
                      field,
                      readMediaPath(document, field) ?? null,
                    ]),
                  ),
                },
                update: { $set: keys },
              },
            });
          }

          if (writes.length) {
            try {
              const result = await models[name].bulkWrite(writes, {
                ...metadataWriteOptions(),
                ordered: false,
                session: backgroundExecution.getStore()?.session,
              });

              if (result.matchedCount !== writes.length) {
                retryScan = true;
                break;
              }
            } catch (error) {
              if (error.code !== 112) throw error;

              retryScan = true;
              break;
            }
          }

          checkBackgroundExecution();
          processedCount += batch.length;

          await MediaOwnershipModel.updateOne(
            { _id: progressId },
            {
              $set: { lastId: batch[batch.length - 1]._id, processedCount },
            },
            { session: getBackgroundSession(), upsert: true },
          );

          await BackgroundOperationModel.updateOne(
            { _id: operation._id },
            {
              $set: {
                dateModified: dayjs().toISOString(),
                message: `${name}: checked ${processedCount.toLocaleString()} records. Progress is saved after every batch.`,
              },
            },
          );

          if (performance.now() - lastProgressAt >= 1000) {
            await publishIndexProgress(id);
            lastProgressAt = performance.now();
          }
        }

        if (retryScan) continue;
      }

      await MediaOwnershipModel.updateOne(
        { _id: progressId },
        { $set: { complete: true } },
        { session: getBackgroundSession(), upsert: true },
      );

      await BackgroundOperationModel.updateOne(
        { _id: operation._id },
        { $pull: { targetIds: name } },
      );
    }

    await MediaOwnershipModel.updateOne(
      { _id: getMediaIndexVersion() },
      { $set: { complete: true } },
      { session: getBackgroundSession(), upsert: true },
    );

    await publishIndexProgress(id);

    await setBackgroundOperationStatus(id, "COMPLETE", {
      message: "Media path indexes are ready.",
    });

    return true;
  } catch (error) {
    checkBackgroundExecution();

    await setBackgroundOperationStatus(id, "ERROR", { error: error.message });

    throw error;
  }
};
