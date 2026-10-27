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

export const waitForWork = async (pending: Promise<unknown>, signals: AbortSignal[]) => {
  const activeSignals = [...new Set(signals.filter(Boolean))];
  let handleAbort: () => void;

  try {
    await new Promise<void>((resolve, reject) => {
      handleAbort = () => reject(activeSignals.find((signal) => signal.aborted)?.reason);

      for (const signal of activeSignals)
        signal.addEventListener("abort", handleAbort, { once: true });

      pending.then(() => resolve(), reject);

      if (activeSignals.some((signal) => signal.aborted)) handleAbort();
    });
  } finally {
    for (const signal of activeSignals) signal.removeEventListener("abort", handleAbort);
  }
};

interface ResourceRequest {
  grant: () => void;
  priority: number;
  resources: string[];
}

const busyResources = new Set<string>();
const resourceRequests: ResourceRequest[] = [];

const grantResourceRequests = () => {
  for (const request of [...resourceRequests]) {
    if (request.resources.some((resource) => busyResources.has(resource))) continue;

    for (const resource of request.resources) busyResources.add(resource);

    resourceRequests.splice(resourceRequests.indexOf(request), 1);
    request.grant();
  }
};

/**
 * Runs work once every resource it needs is free, taking them together, lower priorities first.
 * Waiting work holds nothing, so later work whose resources are free runs meanwhile. `release`
 * frees the held resources besides those kept, handing them on before the work finishes.
 */
export const withResources = async <T>(
  resources: string[],
  priority: number,
  signals: AbortSignal[],
  run: (release: (kept?: string[]) => void) => Promise<T>,
) => {
  const held = new Set(resources);

  const release = (kept: string[] = []) => {
    for (const resource of held) {
      if (kept.includes(resource)) continue;

      held.delete(resource);
      busyResources.delete(resource);
    }

    grantResourceRequests();
  };

  let grant: () => void;
  const granted = new Promise<void>((resolve) => {
    grant = resolve;
  });

  const request: ResourceRequest = { grant, priority, resources: [...held] };
  const index = resourceRequests.findIndex((other) => other.priority > priority);

  resourceRequests.splice(index === -1 ? resourceRequests.length : index, 0, request);
  grantResourceRequests();

  try {
    await waitForWork(granted, signals);
  } catch (error) {
    if (resourceRequests.includes(request))
      resourceRequests.splice(resourceRequests.indexOf(request), 1);
    else release();

    throw error;
  }

  try {
    return await run(release);
  } finally {
    release();
  }
};
