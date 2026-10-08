import { randomUUID } from "crypto";
import { FileModel, FileSchema } from "medior/_generated/server/models";
import { Schema } from "mongoose";
import { registerPersistenceModel } from "medior/server/database/persistence";
import { serverShutdownSignal } from "medior/server/process-lifecycle";
import { chunkArray, isDeepEqual } from "medior/utils/common";
import {
  DUPLICATE_PAGE_SIZE,
  DuplicateSearchOptions,
  validateDuplicateSearchOptions,
} from "medior/utils/common/duplicate-search";
import { leanModelToJson } from "medior/utils/server";
import { vectorTrpc } from "medior/utils/server/trpc";

export interface DuplicateGroup {
  /** The keeper first, then files at or above the review threshold by similarity to it. */
  files: (FileSchema & { similarity: number })[];
  id: string;
  score: number;
}

interface ScanGroup {
  _id: string;
  /** Each score is the file's exact similarity to the keeper. */
  files: { hash: string; id: string; score?: number }[];
  /** Best-quality available file that member scores are measured against. */
  keeperId?: string;
  scanId: string;
  /** Highest member similarity to the keeper. */
  score: number;
}

interface DuplicateScan {
  _id: string;
  cursor: string;
  elapsedMs: number;
  error: string;
  found: number;
  options: DuplicateSearchOptions;
  processed: number;
  scope: string;
  skipped: number;
  sourceFileId: string;
  status: "complete" | "error" | "paused" | "running";
  total: number;
}

interface ScanTask {
  claimedIds: Set<string>;
  controller: AbortController;
  promise: Promise<void>;
  scan: DuplicateScan;
  startedAt: number;
}

const scanSchema = new Schema<DuplicateScan>({
  _id: String,
  cursor: String,
  elapsedMs: Number,
  error: String,
  found: Number,
  options: { minSimilarity: Number },
  processed: Number,
  scope: String,
  skipped: Number,
  sourceFileId: String,
  status: String,
  total: Number,
});

scanSchema.index({ scope: 1 }, { unique: true });

const groupSchema = new Schema<ScanGroup>({
  _id: String,
  files: [{ _id: false, hash: String, id: String, score: Number }],
  keeperId: String,
  scanId: String,
  score: Number,
});

groupSchema.index({ scanId: 1, score: -1, _id: 1 });

// Record type names are persisted discriminators with indexes created during consolidation.
const ScanGroupModel = registerPersistenceModel<ScanGroup>("ImageCopyPair", groupSchema);
const DuplicateScanModel = registerPersistenceModel<DuplicateScan>("ImageCopyScan", scanSchema);

const BATCH_SIZE = 512;
const QUERY_SIZE = 128;
const SCORE_BATCH_SIZE = 500;

const fileProjection = { hash: 1, isArchived: 1, isCorrupted: 1 };

let starting = false;
const tasks = new Map<string, ScanTask>();

/** Keep the highest resolution, then the longest duration, then the largest file. */
export const compareDuplicateQuality = (a: FileSchema, b: FileSchema) =>
  b.width * b.height - a.width * a.height ||
  (b.duration ?? 0) - (a.duration ?? 0) ||
  b.size - a.size ||
  a.id.localeCompare(b.id);

const isEligible = (file: { isArchived?: boolean; isCorrupted?: boolean }) =>
  !file.isArchived && !file.isCorrupted;

/** Scores each group's files against its best-quality available file, from stored vectors. */
const scoreGroups = async (groups: Pick<ScanGroup, "_id" | "files">[]) => {
  const files = await FileModel.find({
    _id: { $in: groups.flatMap((group) => group.files.map((file) => file.id)) },
    isArchived: { $ne: true },
  })
    .select({ duration: 1, height: 1, size: 1, width: 1 })
    .lean();
  const byId = new Map(files.map((file) => [String(file._id), leanModelToJson<FileSchema>(file)]));
  const keeperIds = groups.map(
    (group) =>
      group.files
        .filter((file) => byId.has(file.id))
        .map((file) => byId.get(file.id))
        .sort(compareDuplicateQuality)[0]?.id ?? group.files[0].id,
  );
  const scores = await vectorTrpc.scoreFileSimilarities.mutate({
    groups: groups.map((group, index) => ({
      fileIds: group.files.map((file) => file.id),
      referenceId: keeperIds[index],
    })),
  });

  return groups.map((group, index) => {
    const scoredFiles = group.files.map((file) => ({ ...file, score: scores[index][file.id] }));
    const memberScores = scoredFiles
      .filter((file) => file.id !== keeperIds[index])
      .map((file) => file.score);

    return { files: scoredFiles, keeperId: keeperIds[index], score: Math.max(0, ...memberScores) };
  });
};

/** Scores groups saved before per-file scores existed, from their stored vectors. */
const scoreUnscoredGroups = async (scanId: string) => {
  const groups = await ScanGroupModel.find({ keeperId: { $exists: false }, scanId })
    .select({ files: 1 })
    .lean();

  for (const batch of chunkArray(groups, SCORE_BATCH_SIZE)) {
    const scored = await scoreGroups(batch);

    await ScanGroupModel.bulkWrite(
      batch.map((group, index) => ({
        updateOne: { filter: { _id: group._id }, update: { $set: scored[index] } },
      })),
      { ordered: false },
    );
  }
};

const searchBatch = async (task: ScanTask) => {
  const { claimedIds, scan } = task;
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
    .limit(BATCH_SIZE)
    .lean();

  if (scan.sourceFileId && !models.some(isEligible))
    throw new Error("This file is archived, corrupted, or no longer available.");

  for (const batch of chunkArray(models, QUERY_SIZE)) {
    signal.throwIfAborted();

    const sources = batch
      .filter((file) => isEligible(file) && !claimedIds.has(String(file._id)))
      .map((file) => ({ fileId: String(file._id), hash: file.hash }));
    const results = sources.length
      ? await vectorTrpc.findDuplicateCandidates.mutate(
          {
            files: sources,
            minSimilarity: scan.options.minSimilarity,
            useSearchIndex: !scan.sourceFileId,
          },
          { signal },
        )
      : [];

    const candidateIds = [
      ...new Set(results.flatMap((result) => result.candidates.map((match) => match.fileId))),
    ];
    const candidates = candidateIds.length
      ? await FileModel.find({ _id: { $in: candidateIds } })
          .select(fileProjection)
          .lean()
      : [];

    const hashes = new Map(sources.map((file) => [file.fileId, file.hash]));
    const groups: Pick<ScanGroup, "_id" | "files" | "scanId">[] = [];

    for (const file of candidates.filter(isEligible)) hashes.set(String(file._id), file.hash);

    for (const result of results) {
      if (!result.indexed) scan.skipped++;
      else if (scan.sourceFileId || !claimedIds.has(result.fileId)) {
        // A stale vector belongs to an older version of the file, so it cannot vouch for it.
        const matches = result.candidates.filter(
          (match) =>
            hashes.get(match.fileId) === match.hash &&
            (scan.sourceFileId || !claimedIds.has(match.fileId)),
        );

        if (matches.length) {
          const files = [result.fileId, ...matches.map((match) => match.fileId)].map((id) => ({
            hash: hashes.get(id),
            id,
          }));

          groups.push({ _id: scan._id + ":" + result.fileId, files, scanId: scan._id });

          for (const file of files) claimedIds.add(file.id);
        }
      }
    }

    signal.throwIfAborted();

    if (groups.length) {
      const scored = await scoreGroups(groups);
      const result = await ScanGroupModel.bulkWrite(
        groups.map(({ _id, ...group }, index) => ({
          updateOne: {
            filter: { _id },
            update: { $set: { ...group, ...scored[index] } },
            upsert: true,
          },
        })),
        { ordered: false },
      );

      scan.found += result.upsertedCount;
    }

    scan.processed += batch.length;
    scan.cursor = String(batch[batch.length - 1]._id);

    await DuplicateScanModel.updateOne(
      { _id: scan._id },
      { $set: { ...scan, elapsedMs: scan.elapsedMs + Date.now() - task.startedAt } },
    );
  }

  if (scan.sourceFileId || models.length < BATCH_SIZE) scan.status = "complete";
};

const runScan = async (task: ScanTask) => {
  const { scan } = task;
  const signal = task.controller.signal;

  const abort = () => task.controller.abort(serverShutdownSignal.reason);

  serverShutdownSignal.addEventListener("abort", abort, { once: true });

  try {
    if (serverShutdownSignal.aborted) abort();

    signal.throwIfAborted();

    // Files grouped before a pause stay in their groups when the search resumes.
    if (!scan.sourceFileId) {
      const groups = await ScanGroupModel.find({ scanId: scan._id }).select({ files: 1 }).lean();

      task.claimedIds = new Set(groups.flatMap((group) => group.files.map((file) => file.id)));
    }

    if (!scan.sourceFileId && !(await vectorTrpc.getSearchIndexStatus.mutate()).hasIndex)
      throw new Error(
        "Searching the whole library requires the similarity search index. Build it in Settings → Repair, then search again.",
      );

    scan.total = scan.sourceFileId ? 1 : await FileModel.estimatedDocumentCount();

    while (scan.status === "running") {
      signal.throwIfAborted();

      await searchBatch(task);
    }
  } catch (error) {
    scan.status = signal.aborted ? "paused" : "error";
    scan.error = signal.aborted ? "" : error.message;
  } finally {
    serverShutdownSignal.removeEventListener("abort", abort);
    scan.elapsedMs += Date.now() - task.startedAt;

    try {
      await DuplicateScanModel.updateOne({ _id: scan._id }, { $set: scan });
    } finally {
      tasks.delete(scan._id);
    }
  }
};

export const getDuplicateScanProgress = async (args: {
  scanId?: string;
  sourceFileId?: string;
}) => {
  const saved = await DuplicateScanModel.findOne(
    args.scanId ? { _id: args.scanId } : { scope: args.sourceFileId || "library" },
  ).lean();

  if (!saved) return null;

  // Searches saved by the retired pixel-comparison finder stored pairs in another shape.
  if ("pixelTolerance" in saved.options) {
    await ScanGroupModel.deleteMany({ scanId: saved._id });
    await DuplicateScanModel.deleteOne({ _id: saved._id });

    return null;
  }

  const task = tasks.get(saved._id);
  const scan = task?.scan ?? saved;

  if (!task && !starting && scan.status === "running") {
    scan.status = "paused";
    scan.found = await ScanGroupModel.countDocuments({ scanId: scan._id });

    await DuplicateScanModel.updateOne(
      { _id: scan._id },
      { $set: { found: scan.found, status: "paused" } },
    );
  }

  return {
    ...scan,
    elapsedMs: scan.elapsedMs + (task ? Date.now() - task.startedAt : 0),
    status: task ? ("running" as const) : scan.status,
  };
};

export const pauseDuplicateScan = async (scanId: string) => {
  const task = tasks.get(scanId);

  task?.controller.abort();
  await task?.promise;
};

export const startDuplicateScan = async (
  options: DuplicateSearchOptions,
  sourceFileId?: string,
  restart = false,
) => {
  validateDuplicateSearchOptions(options);

  if (starting || tasks.size)
    throw new Error("Pause the current duplicate search before starting another.");

  starting = true;

  try {
    const scope = sourceFileId || "library";
    let scan = await DuplicateScanModel.findOne({ scope }).lean();

    if (!scan || restart || scan.status === "complete" || !isDeepEqual(scan.options, options)) {
      if (scan) await ScanGroupModel.deleteMany({ scanId: scan._id });

      scan = {
        _id: scan?._id ?? randomUUID(),
        cursor: "",
        elapsedMs: 0,
        error: "",
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
    scan.found = await ScanGroupModel.countDocuments({ scanId: scan._id });
    scan.status = "running";

    await DuplicateScanModel.replaceOne({ _id: scan._id }, scan, { upsert: true });

    const task: ScanTask = {
      claimedIds: new Set(),
      controller: new AbortController(),
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

export const getDuplicateScanGroupsById = (scanId: string, groupIds: string[]) =>
  ScanGroupModel.find({ _id: { $in: groupIds }, scanId }).lean();

/** Groups with a member at or above the review threshold, which may exceed the scan's own. */
export const listDuplicateScanGroups = async (scanId: string, minSimilarity: number) => {
  await scoreUnscoredGroups(scanId);

  return ScanGroupModel.find({ scanId, score: { $gte: minSimilarity } })
    .select({ files: 1, keeperId: 1 })
    .lean();
};

export const getDuplicateScanGroups = async (
  scanId: string,
  page: number,
  minSimilarity: number,
) => {
  await scoreUnscoredGroups(scanId);

  const filter = { scanId, score: { $gte: minSimilarity } };
  const total = await ScanGroupModel.countDocuments(filter);
  const currentPage = Math.min(page, Math.max(1, Math.ceil(total / DUPLICATE_PAGE_SIZE)));
  const groups = await ScanGroupModel.find(filter)
    .sort({ score: -1, _id: 1 })
    .skip((currentPage - 1) * DUPLICATE_PAGE_SIZE)
    .limit(DUPLICATE_PAGE_SIZE)
    .lean();

  return { groups, page: currentPage, total };
};

/**
 * Keeps only the given remaining files in each group. Member scores stay valid while the keeper
 * remains, so only groups that lost their keeper are re-scored, together; groups left without
 * duplicates are removed. Returns the updated state of each group that still exists.
 */
export const updateDuplicateScanGroups = async (
  scanId: string,
  updates: { files: ScanGroup["files"]; group: Pick<ScanGroup, "_id" | "keeperId"> }[],
) => {
  const emptied = updates.filter((update) => update.files.length < 2);
  const kept = updates.filter(
    (update) =>
      update.files.length > 1 && update.files.some((file) => file.id === update.group.keeperId),
  );
  const rescored = updates.filter(
    (update) =>
      update.files.length > 1 && !update.files.some((file) => file.id === update.group.keeperId),
  );
  const scores = rescored.length
    ? await scoreGroups(rescored.map((update) => ({ _id: update.group._id, files: update.files })))
    : [];
  const updated = new Map<string, Pick<ScanGroup, "files" | "keeperId" | "score">>([
    ...kept.map((update): [string, Pick<ScanGroup, "files" | "keeperId" | "score">] => [
      update.group._id,
      {
        files: update.files,
        keeperId: update.group.keeperId,
        score: Math.max(
          0,
          ...update.files
            .filter((file) => file.id !== update.group.keeperId)
            .map((file) => file.score),
        ),
      },
    ]),
    ...rescored.map((update, index): [string, Pick<ScanGroup, "files" | "keeperId" | "score">] => [
      update.group._id,
      scores[index],
    ]),
  ]);

  if (updated.size)
    await ScanGroupModel.bulkWrite(
      [...updated].map(([_id, update]) => ({
        updateOne: { filter: { _id, scanId }, update: { $set: update } },
      })),
      { ordered: false },
    );

  if (emptied.length) {
    const result = await ScanGroupModel.deleteMany({
      _id: { $in: emptied.map((update) => update.group._id) },
      scanId,
    });
    const task = tasks.get(scanId);

    if (result.deletedCount) {
      if (task) task.scan.found -= result.deletedCount;

      await DuplicateScanModel.updateOne(
        { _id: scanId },
        { $inc: { found: -result.deletedCount } },
      );
    }
  }

  return updated;
};
