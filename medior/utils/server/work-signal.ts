import { AsyncLocalStorage } from "async_hooks";

export const workSignal = new AsyncLocalStorage<AbortSignal>();

/** Dispatch only active work; pending items remain represented by the caller's durable source. */
export const runConcurrent = async <T>(
  items: T[],
  concurrency: number,
  run: (item: T, index: number) => Promise<void>,
  signal = workSignal.getStore(),
  workerScope?: (run: () => Promise<void>) => Promise<void>,
) => {
  let failure: unknown;
  let hasFailed = false;
  let next = 0;

  const recordFailure = (error: unknown) => {
    if (hasFailed) return;

    failure = error;
    hasFailed = true;
  };

  const runWorker = async () => {
    try {
      while (!hasFailed && next < items.length) {
        signal?.throwIfAborted();

        const index = next++;

        await run(items[index], index);
        signal?.throwIfAborted();
      }
    } catch (error) {
      recordFailure(error);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(items.length, Math.max(1, concurrency)) }, async () => {
      try {
        if (workerScope) await workerScope(runWorker);
        else await runWorker();
      } catch (error) {
        recordFailure(error);
      }
    }),
  );

  if (hasFailed) throw failure;
};

export const waitForWork = async (pending: Promise<void>, signals: AbortSignal[]) => {
  const activeSignals = [...new Set(signals.filter(Boolean))];
  let handleAbort: () => void;

  try {
    await new Promise<void>((resolve, reject) => {
      handleAbort = () => reject(activeSignals.find((signal) => signal.aborted)?.reason);

      for (const signal of activeSignals)
        signal.addEventListener("abort", handleAbort, { once: true });

      pending.then(resolve, reject);

      if (activeSignals.some((signal) => signal.aborted)) handleAbort();
    });
  } finally {
    for (const signal of activeSignals) signal.removeEventListener("abort", handleAbort);
  }
};
