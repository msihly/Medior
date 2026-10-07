import { FileImportModel } from "medior/_generated/server/models";
import { runBackgroundExecution } from "medior/server/database/background-execution";
import { getBackgroundSession } from "medior/server/database/database-context";
import { getCommonSourceFolder } from "medior/utils/server/source-folders";

export const getImportSourceFolder = async (batchIds: string[], statuses?: string[]) => {
  let folder: string | undefined;

  for await (const entry of FileImportModel.find({
    batchId: { $in: batchIds },
    ...(statuses ? { status: { $in: statuses } } : {}),
  })
    .select({ path: 1 })
    .lean()
    .cursor({ batchSize: 500 })) {
    const next = getCommonSourceFolder([entry.path]);

    folder =
      folder === undefined
        ? next
        : folder && next
          ? getCommonSourceFolder([folder, next], true)
          : null;

    if (folder === null) break;
  }

  return folder ?? null;
};

/** Keep entry writes and their batch counters atomic, including cancellation and retries. */
export const runImportTransaction = async <T>(run: () => Promise<T>) => {
  let result: T;

  await runBackgroundExecution(
    async () => {
      await getBackgroundSession().withTransaction(
        async () => {
          result = await run();
        },
        { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } },
      );
    },
    undefined,
    false,
  );

  return result;
};
