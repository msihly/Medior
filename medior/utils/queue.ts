import { toast } from "react-toastify";
import { rng, sleep } from "medior/utils";

export interface PromiseQueueOptions {
  concurrency?: number;
  delayRange?: [number, number];
}

export class PromiseQueue {
  cancelled = false;
  concurrency: PromiseQueueOptions["concurrency"];
  delayRange: PromiseQueueOptions["delayRange"];
  queue: (() => void)[] = [];
  runningCount = 0;

  constructor({ concurrency, delayRange }: PromiseQueueOptions = {}) {
    this.concurrency = concurrency ?? 1;
    this.delayRange = delayRange;
  }

  add<T>(fn: (...args: any) => Promise<T>, options?: Partial<PromiseQueueOptions>): Promise<T> {
    const opts: Partial<PromiseQueueOptions> = {
      concurrency: options?.concurrency ?? this.concurrency,
      delayRange: options?.delayRange ?? this.delayRange,
    };

    return new Promise((resolve, reject) => {
      const attempt = () => {
        if (this.cancelled) reject({ cancelled: true });
        else if (this.runningCount < opts.concurrency) {
          this.runningCount++;
          fn()
            .then(resolve)
            .catch(reject)
            .finally(async () => {
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

  clear() {
    this.queue = [];
    this.runningCount = 0;
    this.cancelled = false;
  }

  next() {
    if (this.queue.length > 0 && this.runningCount < this.concurrency) {
      const nextTask = this.queue.shift();
      if (nextTask) nextTask();
    }
  }
}

export const makeQueue = <T>({
  action,
  items,
  logPrefix = "Refreshed",
  logSuffix,
  onComplete,
  queue,
}: {
  action: (item: T) => Promise<any>;
  items: T[];
  logPrefix?: string;
  logSuffix: string;
  onComplete: () => Promise<any>;
  queue: PromiseQueue;
}) => {
  let completedCount = 0;
  const totalCount = items.length;

  const toastId = toast.info(() => `${logPrefix} ${completedCount} ${logSuffix}...`, {
    autoClose: false,
  });

  items.map((item) =>
    queue.add(async () => {
      await action(item);

      completedCount++;
      const isComplete = completedCount === totalCount;
      if (isComplete) await onComplete();

      toast.update(toastId, {
        autoClose: isComplete ? 5000 : false,
        render: `${logPrefix} ${completedCount} / ${totalCount} ${logSuffix}${
          isComplete ? "." : "..."
        }`,
      });
    })
  );
};
