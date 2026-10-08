import { AsyncLocalStorage } from "async_hooks";
import mongoose, { ClientSession } from "mongoose";
import { serverShutdownSignal } from "medior/server/process-lifecycle";
import { workSignal } from "medior/utils/server/work-signal";

interface BackgroundExecution {
  cancellation?: Promise<unknown>;
  cancelled: boolean;
  controller: AbortController;
  isQueue: boolean;
  label?: string;
  operationId?: string;
  resumeQueue?: () => Promise<void>;
  session?: ClientSession;
  sessions: Set<ClientSession>;
}

export const backgroundExecution = new AsyncLocalStorage<BackgroundExecution>();
const executions = new Set<BackgroundExecution>();

export const checkBackgroundExecution = () => {
  serverShutdownSignal.throwIfAborted();

  if (backgroundExecution.getStore()?.cancelled) throw new Error("Background queues paused.");
};

export const runBackgroundExecution = async <T>(
  run: () => Promise<T>,
  signal?: AbortSignal,
  isQueue = true,
) => {
  const parentSignal = workSignal.getStore();

  const execution: BackgroundExecution = {
    cancelled: false,
    controller: new AbortController(),
    isQueue,
    label: backgroundExecution.getStore()?.label,
    sessions: new Set(),
  };

  const cancel = () => {
    cancelExecutions([execution]).catch((error) =>
      console.error("Failed to interrupt background work:", error),
    );
  };

  executions.add(execution);
  signal?.addEventListener("abort", cancel, { once: true });

  if (parentSignal !== signal) parentSignal?.addEventListener("abort", cancel, { once: true });

  serverShutdownSignal.addEventListener("abort", cancel, { once: true });

  try {
    if (signal?.aborted || parentSignal?.aborted || serverShutdownSignal.aborted) cancel();

    return await backgroundExecution.run(execution, async () => {
      checkBackgroundExecution();
      execution.session = await mongoose.startSession();
      execution.sessions.add(execution.session);
      checkBackgroundExecution();

      return workSignal.run(execution.controller.signal, run);
    });
  } finally {
    execution.controller.abort();
    signal?.removeEventListener("abort", cancel);
    parentSignal?.removeEventListener("abort", cancel);
    serverShutdownSignal.removeEventListener("abort", cancel);
    await execution.cancellation?.catch(() => {});
    executions.delete(execution);
    await execution.session?.endSession();
  }
};

const cancelExecutions = async (active: BackgroundExecution[]) => {
  const pending = active.filter((execution) => !execution.cancelled);

  for (const execution of pending) {
    execution.cancelled = true;
    execution.controller.abort(new Error("Background work interrupted; pending work retained."));
  }

  const sessions = pending.flatMap((execution) =>
    [...execution.sessions].map((session) => session.id),
  );

  // An empty killSessions list means ALL sessions. Only interrupt sessions owned by these runners.
  if (sessions.length) {
    const cancellation = mongoose.connection.db.admin().command({ killSessions: sessions });

    for (const execution of pending) execution.cancellation = cancellation;
  }

  await Promise.all(active.map((execution) => execution.cancellation));
};

export const cancelBackgroundExecutions = async (operationId?: string, label?: string) => {
  const active = [...executions].filter((execution) =>
    operationId
      ? execution.operationId === operationId
      : execution.isQueue && (!label || execution.label === label),
  );

  await cancelExecutions(active);

  return [...new Set(active.flatMap((execution) => execution.resumeQueue ?? []))];
};
