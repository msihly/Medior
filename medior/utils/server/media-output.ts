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

/** Persist the intent before publishing. A hard link publishes without overwriting another file. */
export const publishMediaOutput = async (
  output: MediaOutput,
  onPrepared?: (output: MediaOutput) => Promise<void>,
) => {
  await syncMediaFile(output.tempPath, output.hash);
  await onPrepared?.(output);
  workSignal.getStore()?.throwIfAborted();
  await fs.mkdir(path.dirname(output.path), { recursive: true });
  workSignal.getStore()?.throwIfAborted();

  try {
    await fs.link(output.tempPath, output.path);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;

    if ((await hashMediaFile(output.path)) !== output.hash)
      throw new MediaChecksumMismatchError(output.path);
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
