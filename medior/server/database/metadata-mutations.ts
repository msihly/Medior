import { AsyncLocalStorage } from "async_hooks";
import { serverShutdownSignal } from "medior/server/process-lifecycle";
import { waitForWork, workSignal } from "medior/utils/server/work-signal";
import { checkBackgroundExecution } from "./background-execution";

export const metadataMutation = new AsyncLocalStorage<{ active: boolean }>();
let pendingMutation: Promise<void> = Promise.resolve();

/** Keep linked metadata writes and their validation together within the API writer. */
export const withMetadataMutation = async <T>(run: () => Promise<T>): Promise<T> => {
  checkBackgroundExecution();
  workSignal.getStore()?.throwIfAborted();

  if (metadataMutation.getStore()?.active) return run();

  const previous = pendingMutation;
  let release: () => void;
  const owner = { active: true };

  const completed = new Promise<void>((resolve) => {
    release = resolve;
  });

  // A cancelled waiter must not release the next waiter ahead of its current owner.
  pendingMutation = previous.then(() => completed);

  try {
    await waitForWork(previous, [serverShutdownSignal, workSignal.getStore()]);
    checkBackgroundExecution();
    workSignal.getStore()?.throwIfAborted();

    return await metadataMutation.run(owner, run);
  } finally {
    owner.active = false;
    release();
  }
};
