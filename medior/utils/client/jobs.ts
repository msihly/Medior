import type { JobState } from "medior/server/database";
import { Fmt } from "medior/utils/common";
import { toast } from "./toast";

/**
 * Reports what an ended job did from its final message, with how many items it left out for each
 * reason. A job that stopped early says how far it got.
 */
export const toastJobResult = (job: JobState) => {
  const isCutShort = job.isStopping || job.processed < job.total;
  const leftOut = job.failures
    .map(({ count, message }) => `${Fmt.commas(count)} · ${message}`)
    .join("; ");
  const summary = isCutShort
    ? `${job.label} stopped after ${Fmt.commas(job.processed)} / ${Fmt.commas(job.total)}: ${job.message}`
    : job.message;

  if (job.error) toast.error(job.error);
  else if (leftOut) toast.warn(`${summary}. Left out: ${leftOut}`);
  else if (isCutShort) toast.info(summary);
  else toast.success(summary);
};
