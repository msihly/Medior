import { toast } from "react-toastify";
import { rng, sleep, Toaster } from "medior/utils";

export class PromiseChain {
  cancelled = false;
  queue = Promise.resolve();

  add<T>(fn: (...args: any) => Promise<T>): Promise<T> {
    try {
      return new Promise((resolve, reject) => {
        this.queue = this.queue
          .then(() => {
            if (!this.cancelled) return fn();
            else throw { cancelled: true };
          })
          .then(resolve)
          .catch((error) => !error?.cancelled && reject(error));
      });
    } catch (error) {
      return Promise.reject(error);
    }
  }

  cancel() {
    this.cancelled = true;
    this.queue = Promise.reject({ cancelled: true });
  }
}

export interface PromiseQueueOptions {
  concurrency?: number;
  delayRange?: [number, number];
}

export class PromiseQueue {
  cancelled = false;
  concurrency: PromiseQueueOptions["concurrency"];
  delayRange: PromiseQueueOptions["delayRange"];
  queue: (() => Promise<void>)[] = [];
  runningCount = 0;
  private promise: Promise<void> | null = null;
  private resolver: (() => void) | null = null;

  constructor({ concurrency, delayRange }: PromiseQueueOptions = {}) {
    this.concurrency = concurrency ?? 1;
    this.delayRange = delayRange;
  }

  add<T>(fn: (...args: any) => Promise<T>, options?: Partial<PromiseQueueOptions>): Promise<T> {
    const opts: Partial<PromiseQueueOptions> = {
      concurrency: options?.concurrency ?? this.concurrency,
      delayRange: options?.delayRange ?? this.delayRange,
    };

    if (!this.promise) this.promise = new Promise((res) => (this.resolver = res));

    return new Promise((resolve, reject) => {
      const attempt = async () => {
        if (this.cancelled) reject({ cancelled: true });
        else if (this.runningCount < opts.concurrency) {
          this.runningCount++;
          await fn()
            .then(resolve)
            .catch(reject)
            .finally(async () => {
              if (this.cancelled) return reject({ cancelled: true });
              this.runningCount--;
              if (opts.delayRange) await sleep(rng(...opts.delayRange));
              this.next();
            });
        } else this.queue.push(attempt);
      };

      if (this.runningCount < opts.concurrency) attempt();
      else this.queue.push(attempt);
    });
  }

  cancel() {
    this.cancelled = true;
  }

  next() {
    if (this.queue.length > 0 && this.runningCount < this.concurrency) {
      const nextTask = this.queue.shift();
      if (nextTask) nextTask();
    } else if (this.queue.length === 0 && this.runningCount === 0 && this.resolver) {
      this.resolver();
      this.promise = null;
      this.resolver = null;
    }
  }

  async resolve() {
    if (this.promise) await this.promise;
  }
}

export const makeQueue = <T>({
  action,
  items,
  logPrefix = "Refreshed",
  logSuffix,
  onComplete,
  queue,
  withTabTitle,
}: {
  action: (item: T, escapeFn: () => Promise<void>) => Promise<any>;
  items: T[];
  logPrefix: string;
  logSuffix: string;
  onComplete?: (hasError?: boolean) => Promise<any>;
  queue: PromiseQueue;
  withTabTitle?: boolean;
}): Promise<void> => {
  return new Promise<void>((resolve) => {
    const totalCount = items.length;
    let completedCount = 0;
    let hasError = false;
    let isComplete = false;

    const getToastText = () =>
      `${logPrefix} ${completedCount} / ${totalCount} ${logSuffix}${isComplete ? "." : "..."}`;

    const toaster = new Toaster();
    toaster.toast(getToastText(), { autoClose: false, type: "info" });

    const onEscape = async () => {
      updateCompleted();
      resolve();
      await onComplete?.(hasError);
    };

    const setHasError = (error: boolean) => (hasError = error);

    const updateCompleted = () => {
      if (completedCount < totalCount) completedCount++;
      isComplete = completedCount >= totalCount;
      updateToast();
      if (withTabTitle) updateTabTitle();
    };

    const updateTabTitle = () =>
      (document.title =
        completedCount >= totalCount
          ? hasError
            ? "ERROR"
            : "Done!"
          : `[${completedCount}/${totalCount}] Downloading`);

    const updateToast = () =>
      toaster.toast(getToastText(), {
        autoClose: isComplete ? 3000 : false,
        type: isComplete ? "success" : undefined,
      });

    if (withTabTitle) updateTabTitle();

    for (const item of items) {
      queue.add(async () => {
        try {
          await action(item, onEscape);
        } catch (err) {
          console.error(err);
          toast.error(err.message);
          setHasError(true);
        } finally {
          updateCompleted();
          if (isComplete) await onEscape();
        }
      });
    }
  });
};