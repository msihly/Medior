import { randomUUID } from "crypto";
import { FileModel, FileSchema } from "medior/_generated/server/models";
import { Schema } from "mongoose";
import { registerPersistenceModel } from "medior/server/database/persistence";
import { serverShutdownSignal } from "medior/server/process-lifecycle";
import { chunkArray, isDeepEqual } from "medior/utils/common";
import {
  compareImageCopyPixels,
  IMAGE_COPY_SIZE,
  ImageCopyOptions,
  normalizeImageCopyPixels,
  validateImageCopyOptions,
} from "medior/utils/common/image-copy-matching";
import { getIsImage, leanModelToJson } from "medior/utils/server";
import { runImageTask } from "medior/utils/server/image-task";
import { stopNativeTask } from "medior/utils/server/native-task";
import { vectorTrpc } from "medior/utils/server/trpc";
import { runConcurrent } from "medior/utils/server/work-signal";

type ScanFile = Pick<
  FileSchema,
  "duration" | "ext" | "hash" | "height" | "id" | "path" | "thumb" | "width"
>;

export interface LowerResolutionPair {
  canArchive: boolean;
  copy: FileSchema;
  isLowerResolution: boolean;
  retained: FileSchema;
  score: number;
}

interface ScanPair {
  _id: string;
  copy: ScanFile;
  isLowerResolution: boolean;
  retained: ScanFile;
  scanId: string;
  score: number;
}

interface CopyScan {
  _id: string;
  compared: number;
  cursor: string;
  elapsedMs: number;
  error: string;
  failureCount: number;
  found: number;
  options: ImageCopyOptions;
  processed: number;
  scope: string;
  skipped: number;
  sourceFileId: string;
  status: "complete" | "error" | "paused" | "running";
  total: number;
}

interface ScanTask {
  cache: Map<string, Promise<Awaited<ReturnType<typeof decodeImage>>>>;
  controller: AbortController;
  isPreparingIndex: boolean;
  promise: Promise<void>;
  scan: CopyScan;
  startedAt: number;
}

const scanSchema = new Schema<CopyScan>({
  _id: String,
  compared: Number,
  cursor: String,
  elapsedMs: Number,
  error: String,
  failureCount: Number,
  found: Number,
  options: { minSimilarity: Number, pixelTolerance: Number },
  processed: Number,
  scope: String,
  skipped: Number,
  sourceFileId: String,
  status: String,
  total: Number,
});

scanSchema.index({ scope: 1 }, { unique: true });

const pairSchema = new Schema<ScanPair>({
  _id: String,
  copy: Schema.Types.Mixed,
  isLowerResolution: Boolean,
  retained: Schema.Types.Mixed,
  scanId: String,
  score: Number,
});

pairSchema.index({ scanId: 1, score: -1, _id: 1 });
pairSchema.index({ scanId: 1, "retained.id": 1 });

const CopyPairModel = registerPersistenceModel<ScanPair>("ImageCopyPair", pairSchema);
const CopyScanModel = registerPersistenceModel<CopyScan>("ImageCopyScan", scanSchema);
const fileProjection = {
  duration: 1,
  ext: 1,
  hash: 1,
  height: 1,
  isArchived: 1,
  isCorrupted: 1,
  path: 1,
  thumb: 1,
  width: 1,
};
let starting = false;
const tasks = new Map<string, ScanTask>();

const hasCompatibleShape = (a: ScanFile, b: ScanFile) =>
  Math.abs(a.width / a.height - b.width / b.height) <= 2 / Math.min(a.height, b.height);

const isEligible = (
  file: Pick<ScanFile, "duration" | "ext" | "height" | "width"> & {
    isArchived?: boolean;
    isCorrupted?: boolean;
  },
) =>
  !file.isArchived &&
  !file.isCorrupted &&
  getIsImage(file.ext) &&
  !file.duration &&
  file.width > 0 &&
  file.height > 0;

const decodeImage = async (file: ScanFile, signal?: AbortSignal, thumbnail = false) => {
  const { decoded, metadata } = await runImageTask(
    {
      comparisonSize: { height: IMAGE_COPY_SIZE, width: IMAGE_COPY_SIZE },
      concurrency: 1,
      input: thumbnail ? file.thumb.path : file.path,
    },
    signal,
  );
  const rotated = (metadata.orientation ?? 1) >= 5;

  return {
    height: rotated ? metadata.width : metadata.height,
    pixels: normalizeImageCopyPixels(decoded.data),
    still: (metadata.pages ?? 1) === 1,
    width: rotated ? metadata.height : metadata.width,
  };
};

const getPixels = (task: ScanTask, file: ScanFile, thumbnail: boolean) => {
  const key = [file.hash, thumbnail ? file.thumb?.path : file.path].join(":");
  let pixels = task.cache.get(key);

  if (pixels) task.cache.delete(key);
  else {
    pixels = decodeImage(file, task.controller.signal, thumbnail).catch((error) => {
      task.cache.delete(key);

      throw error;
    });
  }

  task.cache.set(key, pixels);

  while (task.cache.size > 128) task.cache.delete(task.cache.keys().next().value);

  return pixels;
};

const comparePair = async (task: ScanTask, source: ScanFile, candidate: ScanFile) => {
  const sourceArea = source.width * source.height;
  const candidateArea = candidate.width * candidate.height;
  const sourceIsCopy =
    sourceArea < candidateArea || (sourceArea === candidateArea && source.id > candidate.id);

  const copy = sourceIsCopy ? source : candidate;
  const retained = sourceIsCopy ? candidate : source;

  if ((!task.scan.sourceFileId && !sourceIsCopy) || !hasCompatibleShape(copy, retained)) return;

  if (copy.width > retained.width || copy.height > retained.height) return;

  // Thumbnails reject unrelated ANN neighbours without decoding the originals.
  // Discovery is approximate; accepted matches are always measured on originals.
  if (copy.thumb?.path && retained.thumb?.path) {
    const smaller = await getPixels(task, copy, true);
    const larger = await getPixels(task, retained, true);
    const preview = compareImageCopyPixels(smaller.pixels, larger.pixels, {
      minSimilarity: Math.max(1, task.scan.options.minSimilarity - 5),
      pixelTolerance: Math.min(255, task.scan.options.pixelTolerance + 12),
    });

    if (!preview.matches) return;
  }

  const smaller = await getPixels(task, copy, false);
  const larger = await getPixels(task, retained, false);

  task.scan.compared++;

  if (
    !smaller.still ||
    !larger.still ||
    smaller.width > larger.width ||
    smaller.height > larger.height
  )
    return;

  const result = compareImageCopyPixels(smaller.pixels, larger.pixels, task.scan.options);

  if (!result.matches) return;

  return {
    _id: task.scan._id + ":" + copy.id,
    copy: { ...copy, height: smaller.height, width: smaller.width },
    isLowerResolution: smaller.width * smaller.height < larger.width * larger.height,
    retained: { ...retained, height: larger.height, width: larger.width },
    scanId: task.scan._id,
    score: result.score,
  };
};

const searchBatch = async (task: ScanTask) => {
  const { scan } = task;
  const signal = task.controller.signal;
  const models = await FileModel.find(
    scan.sourceFileId
      ? { _id: scan.sourceFileId }
      : scan.cursor
        ? { _id: { $gt: scan.cursor } }
        : {},
  )
    .select(fileProjection)
    .sort({ _id: 1 })
    .limit(512)
    .lean();

  if (scan.sourceFileId && !models.some(isEligible))
    throw new Error("The source must be an available still image.");

  for (const batch of chunkArray(models, 32)) {
    signal.throwIfAborted();

    const sourceBatch = batch.filter(isEligible).map((file) => leanModelToJson<ScanFile>(file));
    const candidates = sourceBatch.length
      ? await vectorTrpc.findImageCopyCandidates.mutate(
          {
            files: sourceBatch.map((file) => ({ fileId: file.id, hash: file.hash })),
          },
          { signal },
        )
      : [];

    const ids = [
      ...new Set(
        candidates.flatMap((source) => source.candidates.map((candidate) => candidate.fileId)),
      ),
    ];
    const files = ids.length
      ? await FileModel.find({ _id: { $in: ids } })
          .select(fileProjection)
          .lean()
      : [];

    const byId = new Map(
      files.filter(isEligible).map((file) => [String(file._id), leanModelToJson<ScanFile>(file)]),
    );
    const candidatesById = new Map(candidates.map((source) => [source.fileId, source]));
    const pairs = new Map<string, ScanPair>();
    let skipped = 0;

    await runConcurrent(
      sourceBatch,
      4,
      async (source) => {
        const found = candidatesById.get(source.id);

        if (!found?.indexed) {
          skipped++;
        } else {
          const neighbours = found.candidates
            .filter((candidate) => byId.get(candidate.fileId)?.hash === candidate.hash)
            .map((candidate) => byId.get(candidate.fileId))
            .sort((a, b) => b.width * b.height - a.width * a.height || a.id.localeCompare(b.id));

          for (const neighbour of neighbours) {
            signal.throwIfAborted();

            try {
              const pair = await comparePair(task, source, neighbour);

              if (pair) {
                const previous = pairs.get(pair._id);

                if (
                  !previous ||
                  pair.retained.width * pair.retained.height >
                    previous.retained.width * previous.retained.height
                )
                  pairs.set(pair._id, pair);

                if (!scan.sourceFileId) break;
              }
            } catch {
              signal.throwIfAborted();
              scan.failureCount++;
            }
          }
        }
      },
      signal,
    );

    signal.throwIfAborted();

    if (pairs.size) {
      const result = await CopyPairModel.bulkWrite(
        [...pairs.values()].map(({ _id, ...pair }) => ({
          updateOne: { filter: { _id }, update: { $set: pair }, upsert: true },
        })),
        { ordered: false },
      );

      scan.found += result.upsertedCount;
    }

    scan.processed += batch.length;
    scan.skipped += skipped;
    scan.cursor = String(batch[batch.length - 1]._id);

    await CopyScanModel.updateOne(
      { _id: scan._id },
      { $set: { ...scan, elapsedMs: scan.elapsedMs + Date.now() - task.startedAt } },
    );
  }

  if (scan.sourceFileId || models.length < 512) scan.status = "complete";
};

const runScan = async (task: ScanTask) => {
  const { scan } = task;

  const abort = () => task.controller.abort(serverShutdownSignal.reason);

  serverShutdownSignal.addEventListener("abort", abort, { once: true });

  try {
    if (serverShutdownSignal.aborted) abort();

    task.controller.signal.throwIfAborted();

    await vectorTrpc.prepareImageCopySearch.mutate(undefined, { signal: task.controller.signal });
    task.controller.signal.throwIfAborted();
    task.isPreparingIndex = false;
    scan.total = scan.sourceFileId ? 1 : await FileModel.estimatedDocumentCount();

    while (scan.status === "running") {
      task.controller.signal.throwIfAborted();

      await searchBatch(task);
    }
  } catch (error) {
    scan.status = task.controller.signal.aborted ? "paused" : "error";
    scan.error = task.controller.signal.aborted ? "" : error.message;
  } finally {
    serverShutdownSignal.removeEventListener("abort", abort);
    stopNativeTask("image", task.controller.signal);
    task.cache.clear();
    scan.elapsedMs += Date.now() - task.startedAt;

    try {
      await CopyScanModel.updateOne({ _id: scan._id }, { $set: scan });
    } finally {
      tasks.delete(scan._id);
    }
  }
};

export const getCopyScanProgress = async (args: { scanId?: string; sourceFileId?: string }) => {
  const saved = await CopyScanModel.findOne(
    args.scanId ? { _id: args.scanId } : { scope: args.sourceFileId || "library" },
  ).lean();

  if (!saved) return null;

  const task = tasks.get(saved._id);
  const scan = task?.scan ?? saved;

  if (!task && !starting && scan.status === "running") {
    scan.status = "paused";
    scan.found = await CopyPairModel.countDocuments({ scanId: scan._id });

    await CopyScanModel.updateOne(
      { _id: scan._id },
      { $set: { found: scan.found, status: "paused" } },
    );
  }

  return {
    ...scan,
    elapsedMs: scan.elapsedMs + (task ? Date.now() - task.startedAt : 0),
    isPreparingIndex: task?.isPreparingIndex ?? false,
    status: task ? ("running" as const) : scan.status,
  };
};

export const pauseCopyScan = async (scanId: string) => {
  const task = tasks.get(scanId);

  task?.controller.abort();
  await task?.promise;
};

export const startCopyScan = async (
  options: ImageCopyOptions,
  sourceFileId?: string,
  restart = false,
) => {
  validateImageCopyOptions(options);

  if (starting || tasks.size)
    throw new Error("Pause the current copy search before starting another.");

  starting = true;

  try {
    const scope = sourceFileId || "library";
    let scan = await CopyScanModel.findOne({ scope }).lean();

    if (!scan || restart || scan.status === "complete" || !isDeepEqual(scan.options, options)) {
      if (scan) await CopyPairModel.deleteMany({ scanId: scan._id });

      scan = {
        _id: scan?._id ?? randomUUID(),
        compared: 0,
        cursor: "",
        elapsedMs: 0,
        error: "",
        failureCount: 0,
        found: 0,
        options: { ...options },
        processed: 0,
        scope,
        skipped: 0,
        sourceFileId: sourceFileId ?? null,
        status: "paused",
        total: 0,
      };
    }

    scan.error = "";
    scan.found = await CopyPairModel.countDocuments({ scanId: scan._id });
    scan.status = "running";

    await CopyScanModel.replaceOne({ _id: scan._id }, scan, { upsert: true });

    const task: ScanTask = {
      cache: new Map(),
      controller: new AbortController(),
      isPreparingIndex: true,
      promise: null,
      scan,
      startedAt: Date.now(),
    };

    tasks.set(scan._id, task);
    task.promise = runScan(task);
    task.promise.catch(console.error);

    return scan._id;
  } finally {
    starting = false;
  }
};

export const getCopyScanOptions = async (scanId: string) => {
  const scan = await CopyScanModel.findById(scanId).lean();

  if (!scan || tasks.has(scanId) || scan.status === "running")
    throw new Error("Pause the search before archiving copies.");

  return scan.options;
};

export const getCopyScanPair = async (scanId: string, fileId: string) => {
  const pair = await CopyPairModel.findById(scanId + ":" + fileId).lean();

  if (!pair || (await CopyPairModel.exists({ "retained.id": fileId, scanId }))) return null;

  return pair;
};

export const getCopyScanPairs = async (scanId: string, page: number) => {
  const filter = { scanId };
  const scan = await CopyScanModel.findById(scanId).select({ found: 1 }).lean();
  const total = tasks.get(scanId)?.scan.found ?? scan?.found ?? 0;
  const pageCount = Math.ceil(total / 10);
  const currentPage = Math.min(page, Math.max(1, pageCount));
  const pairs = await CopyPairModel.find(filter)
    .sort({ score: -1, _id: 1 })
    .skip((currentPage - 1) * 10)
    .limit(10)
    .lean();

  const retainedIds = new Set(
    await CopyPairModel.distinct("retained.id", {
      "retained.id": { $in: pairs.map((pair) => pair.copy.id) },
      scanId,
    }),
  );

  return {
    page: currentPage,
    pageCount,
    pairs: pairs.map((pair) => ({ ...pair, canArchive: !retainedIds.has(pair.copy.id) })),
    total,
  };
};

export const removeCopyScanPair = async (scanId: string, fileId: string) => {
  const result = await CopyPairModel.deleteOne({ _id: scanId + ":" + fileId });

  if (result.deletedCount) await CopyScanModel.updateOne({ _id: scanId }, { $inc: { found: -1 } });
};

export const verifyLowerResolutionCopy = async (
  copy: ScanFile,
  retained: ScanFile,
  options: ImageCopyOptions,
) => {
  const smaller = await decodeImage(copy);
  const larger = await decodeImage(retained);

  return (
    smaller.still &&
    larger.still &&
    smaller.width <= larger.width &&
    smaller.height <= larger.height &&
    hasCompatibleShape(
      { ...copy, height: smaller.height, width: smaller.width },
      { ...retained, height: larger.height, width: larger.width },
    ) &&
    compareImageCopyPixels(smaller.pixels, larger.pixels, options).matches
  );
};
