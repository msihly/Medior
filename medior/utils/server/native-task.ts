import path from "path";
import { ChildProcess, fork, ForkOptions } from "child_process";
import { randomUUID } from "crypto";
import { serverShutdownSignal } from "medior/server/process-lifecycle";
import { workSignal } from "medior/utils/server/work-signal";

const busyWorkers = new WeakSet<ChildProcess>();
const workers = new WeakMap<AbortSignal, Map<string, Set<ChildProcess>>>();

export const stopNativeTask = (
  name: string,
  signal = workSignal.getStore() ?? serverShutdownSignal,
) => {
  for (const worker of workers.get(signal)?.get(name) ?? []) worker.kill();
};

/** Reuse model processes within an execution, but never queue work inside a worker. */
export const runNativeTask = <T>(
  name: "image" | "transcription" | "visual",
  input: unknown,
  signal = workSignal.getStore() ?? serverShutdownSignal,
  onProgress?: (message: string, progress?: number) => void,
): Promise<T> => {
  signal?.throwIfAborted();
  serverShutdownSignal.throwIfAborted();

  let worker = [...(workers.get(signal)?.get(name) ?? [])].find(
    (candidate) => candidate.connected && !candidate.killed && !busyWorkers.has(candidate),
  );

  if (!worker) {
    const options: ForkOptions & { windowsHide: boolean } = {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      serialization: "advanced",
      stdio: ["ignore", "ignore", "pipe", "ipc"],
      windowsHide: true,
    };

    worker = fork(
      path.resolve(
        process.env.IS_PACKAGED === "1"
          ? path.join(process.env.RESOURCES_PATH ?? process.resourcesPath, "extraResources")
          : "extraResources",
        `medior/server/${name}-process.js`,
      ),
      [],
      options,
    );

    worker.stderr.on("data", (data) => console.error(`[${name}] ${data}`));
    worker.on("error", (error) => console.error(`[${name}] ${error.message}`));
    worker.setMaxListeners(0);

    const ownedWorker = worker;

    const abort = () => ownedWorker.kill();

    serverShutdownSignal.addEventListener("abort", abort, { once: true });
    worker.once("exit", () => serverShutdownSignal.removeEventListener("abort", abort));

    if (signal !== serverShutdownSignal) {
      signal.addEventListener("abort", abort, { once: true });
    }

    if (!workers.has(signal)) workers.set(signal, new Map());

    if (!workers.get(signal).has(name)) workers.get(signal).set(name, new Set());

    workers.get(signal).get(name).add(worker);

    worker.once("exit", () => {
      signal.removeEventListener("abort", abort);
      workers.get(signal)?.get(name)?.delete(ownedWorker);
    });
  }

  busyWorkers.add(worker);

  return new Promise<T>((resolve, reject) => {
    const id = randomUUID();

    const cleanup = () => {
      worker.off("error", onError);
      worker.off("exit", onExit);
      worker.off("message", onMessage);
      busyWorkers.delete(worker);
    };

    const onError = (error: Error) => {
      worker.kill();
      cleanup();
      reject(error);
    };

    const onExit = (code: number) =>
      onError(signal?.reason ?? new Error(`${name} worker exited with code ${code}`));

    const onMessage = (message: {
      data?: T;
      error?: string;
      id: string;
      progress?: { message: string; percent?: number };
    }) => {
      if (message.id !== id) return;

      if (message.progress) {
        try {
          onProgress?.(message.progress.message, message.progress.percent);
        } catch (error) {
          onError(error);
        }

        return;
      }

      cleanup();

      if (signal?.aborted) reject(signal.reason);
      else if (message.error) reject(new Error(message.error));
      else resolve(message.data);
    };

    worker.once("error", onError);
    worker.once("exit", onExit);
    worker.on("message", onMessage);

    if (signal?.aborted) worker.kill();
    else
      worker.send({ id, input }, (error) => {
        if (error) onError(error);
      });
  });
};
