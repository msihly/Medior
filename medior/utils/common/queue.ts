import { sleep } from "medior/utils/common";

class CancelledError extends Error {
  constructor() {
    super("PromiseQueue cancelled");
    this.name = "CancelledError";
  }
}

export interface PromiseQueueOptions {
  concurrency?: number;
  delayRange?: [number, number];
}

export class PromiseQueue {
  private cancelled = false;
  private concurrency: number;
  private delayRange?: [number, number];
  private promise: Promise<void> | null = null;
  private queue: (() => Promise<void>)[] = [];
  private resolver: (() => void) | null = null;
  private runningCount = 0;

  constructor({ concurrency, delayRange }: PromiseQueueOptions = {}) {
    this.concurrency = concurrency ?? 1;
    this.delayRange = delayRange;
  }

  add<T>(fn: () => Promise<T>): Promise<T> {
    if (this.cancelled) return Promise.reject(new CancelledError());

    if (!this.promise) this.promise = new Promise((res) => (this.resolver = res));

    return new Promise<T>((resolve, reject) => {
      const task = async () => {
        try {
          if (this.cancelled) return reject(new CancelledError());
          this.runningCount++;
          const result = await fn();
          resolve(result);
        } catch (err) {
          reject(err);
        } finally {
          if (this.delayRange) await sleep(...this.delayRange);
          this.runningCount--;
          this.next();
        }
      };

      this.queue.push(task);
      this.next();
    });
  }

  cancel() {
    if (this.cancelled) return;
    this.cancelled = true;

    while (this.queue.length) this.queue.shift()?.();

    if (this.runningCount === 0 && this.resolver) {
      this.resolver();
      this.promise = null;
      this.resolver = null;
    }
  }

  private next() {
    while (!this.cancelled && this.runningCount < this.concurrency && this.queue.length)
      this.queue.shift()?.();

    if (!this.queue.length && this.runningCount === 0 && this.resolver) {
      this.resolver();
      this.promise = null;
      this.resolver = null;
    }
  }

  async resolve() {
    if (this.promise) await this.promise;
  }
}
