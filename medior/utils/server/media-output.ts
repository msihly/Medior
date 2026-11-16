import { createReadStream, createWriteStream } from "fs";
import fs from "fs/promises";
import path from "path";
import { createHash } from "crypto";
import { availableParallelism } from "os";
import { addAbortSignal } from "stream";
import { pipeline } from "stream/promises";
import { Worker } from "worker_threads";
import { getVolumeName, isSolidStateVolume } from "medior/utils/server/drives";
import { moveFileNoReplace } from "medior/utils/server/move-file";
import { runConcurrent, workSignal } from "medior/utils/server/work-signal";

/** Bytes read per step while hashing: far fewer reads than streams' 64 KiB default. */
const HASH_CHUNK_SIZE = 1024 ** 2;

/** Solid-state drives' files hashed at once, a core each, leaving at least half for other work. */
const SOLID_STATE_HASH_THREADS = Math.max(1, Math.min(4, Math.floor(availableParallelism() / 2)));

/**
 * Hashes each file it's sent with blocking reads, which run on the worker's own thread instead of
 * queueing behind other file work in the process's shared I/O thread pool. A cancelled hash stops
 * at its next read and replies with no hash, closing its file, which terminating the worker
 * would leave open.
 */
const HASH_WORKER_SOURCE = `
const { createHash } = require("crypto");
const { closeSync, openSync, readSync } = require("fs");
const { parentPort, workerData } = require("worker_threads");

const buffer = Buffer.allocUnsafe(workerData.chunkSize);
const cancelled = new Int32Array(workerData.cancelled);

const hashFile = (filePath) => {
  const fd = openSync(filePath, "r");

  try {
    const hash = createHash("md5");
    let bytesRead;

    while ((bytesRead = readSync(fd, buffer, 0, buffer.length, null)) > 0) {
      if (Atomics.load(cancelled, 0)) return null;

      hash.update(buffer.subarray(0, bytesRead));
    }

    return hash.digest("hex");
  } finally {
    closeSync(fd);
  }
};

parentPort.on("message", (filePath) => {
  try {
    parentPort.postMessage({ hash: hashFile(filePath) });
  } catch (error) {
    const failure = { code: error?.code, message: error?.message ?? String(error) };

    parentPort.postMessage({ failure });
  }
});
`;

/**
 * Hashes files on a pool of worker threads, each hashing one file at a time. A failure or abort
 * cancels the files still hashing, so it's reported without waiting for them to finish.
 */
const hashOnWorkers = async (filePaths: string[], threads: number, signal?: AbortSignal) => {
  signal?.throwIfAborted();

  const cancelled = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
  const exitedWorkers = new Set<Worker>();
  const hashes: string[] = [];
  const workerErrors = new Map<Worker, Error>();
  const workers: Worker[] = [];

  const cancel = () => Atomics.store(cancelled, 0, 1);

  const startWorker = () => {
    const worker = new Worker(HASH_WORKER_SOURCE, {
      eval: true,
      workerData: { cancelled: cancelled.buffer, chunkSize: HASH_CHUNK_SIZE },
    });

    // A crash's own error explains the exit that follows it.
    worker.on("error", (error) => workerErrors.set(worker, error));
    worker.once("exit", () => exitedWorkers.add(worker));
    workers.push(worker);
  };

  const hashOnWorker = (worker: Worker, filePath: string) =>
    new Promise<string>((resolve, reject) => {
      const onExit = (code: number) => {
        worker.off("message", onMessage);
        reject(
          workerErrors.get(worker) ??
            new Error(`Hash worker exited with code ${code} while hashing ${filePath}`),
        );
      };

      const onMessage = (message: {
        failure?: { code?: string; message: string };
        hash?: string;
      }) => {
        worker.off("exit", onExit);

        if (message.failure)
          reject(Object.assign(new Error(message.failure.message), { code: message.failure.code }));
        else if (message.hash) resolve(message.hash);
        else reject(signal?.reason ?? new Error(`Hashing was cancelled: ${filePath}`));
      };

      if (exitedWorkers.has(worker)) onExit(-1);
      else {
        worker.once("exit", onExit);
        worker.once("message", onMessage);
        worker.postMessage(filePath);
      }
    });

  signal?.addEventListener("abort", cancel, { once: true });

  try {
    // Started inside the try, so workers started before one fails to start still end.
    while (workers.length < Math.min(threads, filePaths.length)) startWorker();

    const idleWorkers = [...workers];

    await runConcurrent(
      filePaths,
      workers.length,
      async (filePath, index) => {
        const worker = idleWorkers.pop();

        try {
          hashes[index] = await hashOnWorker(worker, filePath);
        } catch (error) {
          cancel();
          throw error;
        } finally {
          idleWorkers.push(worker);
        }
      },
      signal,
    );
  } finally {
    signal?.removeEventListener("abort", cancel);
    // Every hash has settled by now, so the workers hold no open files.
    await Promise.all(workers.map((worker) => worker.terminate()));
  }

  return hashes;
};

export class MediaChecksumMismatchError extends Error {
  constructor(public filePath: string) {
    super(`Media checksum mismatch: ${filePath}`);
    this.name = "MediaChecksumMismatchError";
  }
}

export type MediaOutput = { hash: string; path: string; tempPath: string };

export const copyMediaFile = async (
  source: string,
  destination: string,
  exclusive = false,
  onProgress?: (bytes: number) => void,
) => {
  workSignal.getStore()?.throwIfAborted();

  let bytes = 0;
  const stream = createReadStream(source);

  if (onProgress) stream.on("data", (chunk) => onProgress((bytes += chunk.length)));

  await pipeline(stream, createWriteStream(destination, { flags: exclusive ? "wx" : "w" }), {
    signal: workSignal.getStore(),
  });
};

export const hashMediaFile = async (
  filePath: string,
  signal = workSignal.getStore(),
  onProgress?: (bytes: number) => void,
) => {
  signal?.throwIfAborted();

  const hash = createHash("md5");
  const stream = createReadStream(filePath, { highWaterMark: HASH_CHUNK_SIZE });

  if (signal) addAbortSignal(signal, stream);

  let bytes = 0;

  for await (const chunk of stream) {
    hash.update(chunk);
    onProgress?.((bytes += chunk.length));
  }

  signal?.throwIfAborted();

  return hash.digest("hex");
};

/**
 * Hashes files like `hashMediaFile`, each on a worker thread. A solid-state drive's files are
 * hashed several at once, and other drives' one at a time, as reading several at once would make
 * a hard drive seek between them.
 */
export const hashMediaFiles = async (filePaths: string[], signal = workSignal.getStore()) => {
  const drives = new Map<string, { indexes: number[]; isSolidState: boolean }>();
  const hashes: string[] = [];

  for (const [index, filePath] of filePaths.entries()) {
    // Files on no local volume, such as on network shares, are grouped by share.
    const volumeName = getVolumeName(filePath);
    const key = volumeName ?? path.parse(path.resolve(filePath)).root;

    if (!drives.has(key))
      drives.set(key, {
        indexes: [],
        isSolidState: !!volumeName && isSolidStateVolume(volumeName),
      });

    drives.get(key).indexes.push(index);
  }

  for (const { indexes, isSolidState } of drives.values()) {
    const driveHashes = await hashOnWorkers(
      indexes.map((index) => filePaths[index]),
      isSolidState ? SOLID_STATE_HASH_THREADS : 1,
      signal,
    );

    for (const [position, index] of indexes.entries()) hashes[index] = driveHashes[position];
  }

  return hashes;
};

export const syncMediaFile = async (filePath: string, hash?: string) => {
  workSignal.getStore()?.throwIfAborted();

  if (hash && (await hashMediaFile(filePath)) !== hash)
    throw new MediaChecksumMismatchError(filePath);

  const file = await fs.open(filePath, "r+");

  try {
    workSignal.getStore()?.throwIfAborted();
    await file.sync();
  } finally {
    await file.close();
  }

  workSignal.getStore()?.throwIfAborted();
};

/**
 * Links without overwriting. Drives without hard links, such as StableBit DrivePool pools, move the
 * source in instead, also without overwriting. Returns whether the source was moved.
 */
const placeMediaOutput = async (sourcePath: string, output: MediaOutput) => {
  try {
    await fs.link(sourcePath, output.path);
    return false;
  } catch (error) {
    if (error.code !== "ENOTSUP") throw error;

    await moveFileNoReplace(sourcePath, output.path);
    return true;
  }
};

/** An existing file is accepted only when it holds the same media. */
const linkMediaOutput = async (sourcePath: string, output: MediaOutput) => {
  try {
    return await placeMediaOutput(sourcePath, output);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;

    if ((await hashMediaFile(output.path)) !== output.hash)
      throw new MediaChecksumMismatchError(output.path);

    return false;
  }
};

/**
 * Persist the intent before publishing. A hard link, or a move that refuses to replace, publishes
 * without overwriting another file. `isHashed` skips re-reading a temp file the caller hashed itself
 * just before publishing.
 */
export const publishMediaOutput = async (
  output: MediaOutput,
  onPrepared?: (output: MediaOutput) => Promise<void>,
  isHashed = false,
) => {
  await syncMediaFile(output.tempPath, isHashed ? undefined : output.hash);
  await onPrepared?.(output);
  workSignal.getStore()?.throwIfAborted();
  await fs.mkdir(path.dirname(output.path), { recursive: true });
  workSignal.getStore()?.throwIfAborted();

  let isMoved = false;

  try {
    isMoved = await linkMediaOutput(output.tempPath, output);
  } catch (error) {
    if (error.code !== "EXDEV") throw error;

    // Scratch files on another drive are copied and verified beside the destination, then placed.
    const stagingPath = `${output.path}.partial`;

    try {
      await copyMediaFile(output.tempPath, stagingPath);
      await syncMediaFile(stagingPath, output.hash);
      workSignal.getStore()?.throwIfAborted();
      await linkMediaOutput(stagingPath, output);
    } finally {
      await fs.rm(stagingPath, { force: true });
    }
  }

  // The linked or moved output holds the same bytes already verified and flushed above.
  await syncMediaFile(output.path);
  workSignal.getStore()?.throwIfAborted();

  if (!isMoved) await fs.unlink(output.tempPath);

  return { hash: output.hash, path: output.path };
};

export const recoverMediaOutput = async (output: Partial<MediaOutput>) => {
  if (!output.hash || !output.path) return null;

  try {
    await syncMediaFile(output.path, output.hash);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;

    if (!output.tempPath) return null;

    try {
      return await publishMediaOutput(output as MediaOutput);
    } catch (error) {
      if (error.code === "ENOENT") return null;

      throw error;
    }
  }

  if (output.tempPath && output.tempPath !== output.path) {
    try {
      await syncMediaFile(output.tempPath, output.hash);
      workSignal.getStore()?.throwIfAborted();
      await fs.unlink(output.tempPath);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }

  return { hash: output.hash, path: output.path };
};
