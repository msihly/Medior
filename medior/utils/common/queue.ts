import { sleep } from "medior/utils/common";

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
  private cancelled = false;
  private concurrency: PromiseQueueOptions["concurrency"];
  private delayRange: PromiseQueueOptions["delayRange"];
  private promise: Promise<void> | null = null;
  private queue: (() => Promise<void>)[] = [];
  private resolver: (() => void) | null = null;
  private runningCount = 0;

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
              if (opts.delayRange) await sleep(...opts.delayRange);
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
