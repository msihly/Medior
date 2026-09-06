import Mongoose from "mongoose";
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

export const rebuildIndexes = makeAction(async ({ repairId }: { repairId: string }) => {
  const { checkCancelled, report, run } = makeRepairReporter(repairId, "rebuildIndexes");

  return run(async () => {
    const modelsByCollectionName = new Map(
      Object.values(Mongoose.models).map((model) => [model.collection.collectionName, model]),
    );
    const collectionNames = [...modelsByCollectionName.keys()].sort();

    report(
      `Rebuilding indexes for ${collectionNames.length} collections. Each collection will be unavailable while its indexes are rebuilt.`,
    );

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
        `Rebuilding indexes for ${collectionName} (${index + 1} / ${collectionNames.length}).`,
        "progress",
      );
      const droppedIndexNames = await runWhenNoIndexBuildIsRunning(() =>
        modelsByCollectionName.get(collectionName).syncIndexes(),
      );
      if (droppedIndexNames.length)
        report(
          `Removed ${droppedIndexNames.length} obsolete indexes from ${collectionName}: ${droppedIndexNames.join(", ")}.`,
          "progress",
        );
      await runWhenNoIndexBuildIsRunning(() =>
        Mongoose.connection.db.command({ reIndex: collectionName }),
      );
      report(
        `Rebuilt indexes for ${collectionName} (${index + 1} / ${collectionNames.length}).`,
        "progress",
      );
    }

    report(
      `Index rebuild completed successfully for ${collectionNames.length} collections.`,
      "success",
    );
    return { collectionCount: collectionNames.length };
  });
});
