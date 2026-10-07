import path from "path";
import { ChildProcess, fork, ForkOptions } from "child_process";
import { randomUUID } from "crypto";
import { createInterface } from "readline";
import { fileLog } from "trabecula/utils/server";
import { stripVTControlCharacters } from "util";
import { serverShutdownSignal } from "medior/server/process-lifecycle";
import { workSignal } from "medior/utils/server/work-signal";

const busyWorkers = new WeakSet<ChildProcess>();
const cancellationWorkers = new WeakMap<
  AbortSignal,
  { abort: () => void; workers: Set<ChildProcess> }
>();
const idleTimeouts = new WeakMap<ChildProcess, ReturnType<typeof setTimeout>>();
const workerLimits = { image: 4, transcription: 1, visual: 1 };
const workerPools = new Map<string, Set<ChildProcess>>();
const workers = new WeakMap<AbortSignal, Map<string, Set<ChildProcess>>>();
const workerWaiters = new Map<string, Set<() => void>>();

const notifyWorkerAvailability = (name: string) => {
  for (const wake of [...(workerWaiters.get(name) ?? [])]) wake();
};

const waitForNativeWorker = (name: string, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      workerWaiters.get(name)?.delete(wake);
      signal.removeEventListener("abort", abort);
      serverShutdownSignal.removeEventListener("abort", abort);
    };

    const wake = () => {
      cleanup();
      resolve();
    };

    const abort = () => {
      cleanup();
      reject(signal.reason ?? serverShutdownSignal.reason);
    };

    if (!workerWaiters.has(name)) workerWaiters.set(name, new Set());

    workerWaiters.get(name).add(wake);
    signal.addEventListener("abort", abort, { once: true });
    serverShutdownSignal.addEventListener("abort", abort, { once: true });

    if (signal.aborted || serverShutdownSignal.aborted) abort();
  });

const registerWorkerCancellation = (signal: AbortSignal, worker: ChildProcess) => {
  let registration = cancellationWorkers.get(signal);

  if (!registration) {
    registration = {
      abort: () => {
        for (const ownedWorker of registration.workers) ownedWorker.kill();
      },
      workers: new Set(),
    };

    cancellationWorkers.set(signal, registration);
    signal.addEventListener("abort", registration.abort, { once: true });
  }

  registration.workers.add(worker);
  worker.once("close", () => {
    registration.workers.delete(worker);

    if (!registration.workers.size) {
      signal.removeEventListener("abort", registration.abort);
      cancellationWorkers.delete(signal);
    }
  });

  if (signal.aborted) worker.kill();
};

export const stopNativeTask = (
  name: string,
  signal = workSignal.getStore() ?? serverShutdownSignal,
) => {
  for (const worker of workers.get(signal)?.get(name) ?? []) worker.kill();
};

/** Reuse model processes within an execution, but never queue work inside a worker. */
export const runNativeTask = async <T>(
  name: "image" | "transcription" | "visual",
  input: unknown,
  signal = workSignal.getStore() ?? serverShutdownSignal,
  onProgress?: (message: string, progress?: number) => void,
): Promise<T> => {
  signal?.throwIfAborted();
  serverShutdownSignal.throwIfAborted();

  let worker: ChildProcess;

  if (!workerPools.has(name)) workerPools.set(name, new Set());

  const pool = workerPools.get(name);

  while (!worker) {
    signal.throwIfAborted();
    serverShutdownSignal.throwIfAborted();
    worker = [...(workers.get(signal)?.get(name) ?? [])].find(
      (candidate) => candidate.connected && !candidate.killed && !busyWorkers.has(candidate),
    );

    if (worker || pool.size < workerLimits[name]) break;

    const available = [...pool].find((candidate) => !busyWorkers.has(candidate));
    const pending = waitForNativeWorker(name, signal);

    available?.kill();
    await pending;
  }

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

    createInterface({ crlfDelay: Infinity, input: worker.stderr }).on("line", (line) => {
      const message = stripVTControlCharacters(line).trim();
      const severity = message.match(/\[([VIWEF]):onnxruntime:/)?.[1];

      if (message)
        fileLog(`[${name}] ${message}`, {
          type:
            severity === "W" ? "warn" : severity === "V" || severity === "I" ? "debug" : "error",
        });
    });

    worker.on("error", (error) => console.error(`[${name}] ${error.message}`));
    worker.setMaxListeners(0);

    const ownedWorker = worker;

    pool.add(worker);

    registerWorkerCancellation(serverShutdownSignal, worker);

    if (signal !== serverShutdownSignal) {
      registerWorkerCancellation(signal, worker);
    }

    if (!workers.has(signal)) workers.set(signal, new Map());

    if (!workers.get(signal).has(name)) workers.get(signal).set(name, new Set());

    workers.get(signal).get(name).add(worker);

    worker.once("close", () => {
      clearTimeout(idleTimeouts.get(ownedWorker));
      pool.delete(ownedWorker);
      workers.get(signal)?.get(name)?.delete(ownedWorker);
      notifyWorkerAvailability(name);
    });
  }

  clearTimeout(idleTimeouts.get(worker));
  busyWorkers.add(worker);

  return new Promise<T>((resolve, reject) => {
    const id = randomUUID();
    let settled = false;

    const cleanup = () => {
      settled = true;
      worker.off("error", onError);
      worker.off("exit", onExit);
      worker.off("message", onMessage);
      busyWorkers.delete(worker);
      notifyWorkerAvailability(name);

      const idleTimeout = setTimeout(() => {
        if (!busyWorkers.has(worker)) worker.kill();
      }, 30_000);

      idleTimeout.unref();
      idleTimeouts.set(worker, idleTimeout);
    };

    const onError = (error: Error) => {
      if (settled) return;

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
      if (settled || message.id !== id) return;

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
