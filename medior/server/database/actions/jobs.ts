import { getFileLocks } from "medior/server/database/file-locks";
import { getFinishedJobs, getJobs, requestJobStop } from "medior/server/database/jobs";
import { makeAction } from "medior/utils/server";

export const listFileLocks = makeAction(async () => getFileLocks());

/** Running jobs, and recently ended ones whose final update a window may have missed. */
export const listJobs = makeAction(async () => ({
  finished: getFinishedJobs(),
  running: getJobs(),
}));

export const stopJob = makeAction(async ({ id }: { id: string }) => requestJobStop(id));
