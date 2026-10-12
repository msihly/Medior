import { createReadStream, createWriteStream } from "fs";
import fs from "fs/promises";
import path from "path";
import { createHash } from "crypto";
import { addAbortSignal } from "stream";
import { pipeline } from "stream/promises";
import { workSignal } from "medior/utils/server/work-signal";

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
  const stream = createReadStream(filePath);

  if (signal) addAbortSignal(signal, stream);

  let bytes = 0;

  for await (const chunk of stream) {
    hash.update(chunk);
    onProgress?.((bytes += chunk.length));
  }

  signal?.throwIfAborted();

  return hash.digest("hex");
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

/** Links without overwriting; an existing file is accepted only when it holds the same media. */
const linkMediaOutput = async (sourcePath: string, output: MediaOutput) => {
  try {
    await fs.link(sourcePath, output.path);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;

    if ((await hashMediaFile(output.path)) !== output.hash)
      throw new MediaChecksumMismatchError(output.path);
  }
};

/**
 * Persist the intent before publishing. A hard link publishes without overwriting another file.
 * `isHashed` skips re-reading a temp file the caller hashed itself just before publishing.
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

  try {
    await linkMediaOutput(output.tempPath, output);
  } catch (error) {
    if (error.code !== "EXDEV") throw error;

    // Scratch files on another drive are copied and verified beside the destination, then linked.
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

  // A new hard link references the same bytes already verified and flushed above.
  await syncMediaFile(output.path);
  workSignal.getStore()?.throwIfAborted();
  await fs.unlink(output.tempPath);

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
