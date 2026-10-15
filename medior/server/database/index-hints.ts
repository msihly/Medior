import { sleep } from "medior/utils/common";
import { workSignal } from "medior/utils/server/work-signal";

let rebuildCount = 0;

const isMissingHintError = (error: { message?: string }) =>
  !!error?.message?.includes("hint provided does not correspond to an existing index");

/** Marks indexes as being rebuilt, during which queries hinting a dropped index wait for it. */
export const runIndexRebuild = async <T>(run: () => Promise<T>) => {
  rebuildCount++;

  try {
    return await run();
  } finally {
    rebuildCount--;
  }
};

/**
 * Runs a query that hints an index, waiting while Rebuild Existing Indexes has it dropped instead
 * of failing work such as cleanups, which stop reserving their paths once they fail.
 */
export const withIndexHint = async <T>(query: () => Promise<T>) => {
  while (true) {
    try {
      return await query();
    } catch (error) {
      if (!rebuildCount || !isMissingHintError(error)) throw error;

      workSignal.getStore()?.throwIfAborted();
      await sleep(1000);
    }
  }
};
