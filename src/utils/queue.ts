import { toast } from "react-toastify";
import { inspect } from "util";

export class PromiseQueue {
  queue = Promise.resolve();

  add<T>(fn: (...args: any) => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue = this.queue.then(fn).then(resolve).catch(reject);
    });
  }

  clear() {
    this.queue = Promise.resolve();
  }

  isPending() {
    return inspect(this.queue).includes("pending");
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
