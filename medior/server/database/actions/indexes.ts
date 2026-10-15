import Mongoose from "mongoose";
import { canRunBackgroundQueues } from "medior/server/database/actions/background-operations";
import {
  getImporterStatus,
  resumeImporter,
  stopImporter,
} from "medior/server/database/actions/file-imports";
import {
  getFileTransformerStatus,
  runFileTransformer,
  stopFileTransformer,
} from "medior/server/database/actions/file-transforms";
import { getBackgroundSession } from "medior/server/database/database-context";
import { runIndexRebuild } from "medior/server/database/index-hints";
import { ensurePersistenceIndexes, PersistenceModel } from "medior/server/database/persistence";
import { makeRepairReporter } from "medior/server/database/repair-progress";
import { sleep } from "medior/utils/common";
import { makeAction } from "medior/utils/server";

const isIndexBuildInProgressError = (error: unknown) => {
  const mongoError = error as { code?: number; codeName?: string; message?: string };

  return (
    [12586, 12587].includes(mongoError.code) ||
    [
      "BackgroundOperationInProgressForDatabase",
      "BackgroundOperationInProgressForNamespace",
    ].includes(mongoError.codeName) ||
    mongoError.message?.includes("an index build is currently running")
  );
};

export const rebuildIndexes = makeAction(
  async ({
    rebuildExisting = true,
    repairId,
    syncDefinitions = true,
  }: {
    rebuildExisting?: boolean;
    repairId: string;
    syncDefinitions?: boolean;
  }) => {
    const { checkCancelled, report, run } = makeRepairReporter(repairId, "rebuildIndexes");

    // Unique indexes are unenforced while rebuilt, so the main writers pause first. They resume
    // once the repair has ended, outside its work, which is cancelled as it ends.
    const importer = rebuildExisting ? await getImporterStatus(undefined) : null;
    const transformer = rebuildExisting ? await getFileTransformerStatus(undefined) : null;

    try {
      return await runIndexRebuild(() =>
        run(async () => {
          const modelsByCollectionName = new Map(
            Object.values(Mongoose.models).map((model) => [model.collection.collectionName, model]),
          );

          const collectionNames = [...modelsByCollectionName.keys()].sort();

          report(
            `Repairing indexes for ${collectionNames.length} collections.${
              rebuildExisting
                ? " Imports and transforms are paused, and searches using an index are slow while it is rebuilt."
                : ""
            }`,
          );

          if (rebuildExisting) {
            await stopImporter();
            await stopFileTransformer();
          }

          for (let index = 0; index < collectionNames.length; index++) {
            checkCancelled();

            const collectionName = collectionNames[index];

            const runWhenNoIndexBuildIsRunning = async <T>(action: () => Promise<T>) => {
              let waitSeconds = 0;

              while (true) {
                checkCancelled();

                try {
                  return await action();
                } catch (error) {
                  if (!isIndexBuildInProgressError(error)) throw error;

                  if (waitSeconds === 0)
                    report(
                      `An index build is already running for ${collectionName}; waiting for it to finish.`,
                      "progress",
                    );
                  else if (waitSeconds % 30 === 0)
                    report(
                      `Still waiting for the existing index build on ${collectionName} (${waitSeconds} seconds).`,
                      "progress",
                    );

                  await sleep(1000);
                  waitSeconds++;
                }
              }
            };

            report(
              `Repairing indexes for ${collectionName} (${index + 1} / ${collectionNames.length}).`,
              "progress",
            );

            if (syncDefinitions) {
              const droppedIndexNames = await runWhenNoIndexBuildIsRunning(async () => {
                if (collectionName === PersistenceModel.collection.collectionName) {
                  await ensurePersistenceIndexes();

                  return [];
                } else return modelsByCollectionName.get(collectionName).syncIndexes();
              });

              if (droppedIndexNames.length)
                report(
                  `Removed ${droppedIndexNames.length} obsolete indexes from ${collectionName}: ${droppedIndexNames.join(", ")}.`,
                  "progress",
                );
            }

            if (rebuildExisting) {
              const indexSpecs = (
                await modelsByCollectionName
                  .get(collectionName)
                  .collection.indexes({ session: getBackgroundSession() })
              ).filter((spec) => spec.name !== "_id_");

              // Indexes are rebuilt one at a time, so only the one being rebuilt is unavailable.
              for (const spec of indexSpecs) {
                report(`Rebuilding ${spec.name} on ${collectionName}.`, "progress");

                await runWhenNoIndexBuildIsRunning(() =>
                  Mongoose.connection.db.command(
                    { dropIndexes: collectionName, index: spec.name },
                    { session: getBackgroundSession() },
                  ),
                );

                // Cancellation kills the background session, so rebuilding outside it is never cut short.
                try {
                  await Mongoose.connection.db.command({
                    createIndexes: collectionName,
                    indexes: [spec],
                  });
                } catch (error) {
                  throw new Error(
                    `Rebuilding ${spec.name} on ${collectionName} failed, leaving it missing until Synchronize Definitions succeeds: ${error.message}`,
                  );
                }
              }
            }

            report(
              `Repaired indexes for ${collectionName} (${index + 1} / ${collectionNames.length}).`,
              "progress",
            );
          }

          report(
            `Index repair completed successfully for ${collectionNames.length} collections.`,
            "success",
          );

          return { collectionCount: collectionNames.length };
        }),
      );
    } finally {
      // Background work stopping, such as for a shutdown, stays stopped.
      if (canRunBackgroundQueues()) {
        if (importer?.data?.isImporting) await resumeImporter(undefined);

        if (transformer?.data?.isTransforming && transformer.data.activeType)
          await runFileTransformer({ type: transformer.data.activeType });
      }
    }
  },
);
