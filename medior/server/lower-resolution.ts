import { randomUUID } from "crypto";
import { FileModel, FileSchema, TagSchema } from "medior/_generated/server/models";
import { FilterQuery, Schema } from "mongoose";
import * as actions from "medior/server/database/actions";
import { findJob } from "medior/server/database/jobs";
import { registerPersistenceModel } from "medior/server/database/persistence";
import {
  findVariations,
  JpegCompression,
  rankDuplicateQuality,
} from "medior/server/duplicate-quality";
import { serverShutdownSignal } from "medior/server/process-lifecycle";
import { chunkArray, CONSTANTS, dayjs, round } from "medior/utils/common";
import {
  DUPLICATE_PAGE_SIZE,
  DuplicateSearchOptions,
  getVariationSettings,
  MIN_DUPLICATE_SIMILARITY,
  validateDuplicateSearchOptions,
} from "medior/utils/common/duplicate-search";
import { leanModelToJson, sortByStoredNtfsIdentity } from "medior/utils/server";
import { vectorTrpc } from "medior/utils/server/trpc";
import { runConcurrent } from "medior/utils/server/work-signal";

export interface DuplicateGroup {
  /**
   * The keeper first, then files at or above the review threshold by similarity to it. JPEGs
   * carry the compression their best quality was judged by.
   */
  files: (FileSchema & {
    /** Percentage of the image that differs from the keeper's; null where it wasn't measured. */
    difference: number | null;
    isVariation: boolean;
    jpeg: JpegCompression;
    similarity: number;
    tags: TagSchema[];
  })[];
  id: string;
  /**
   * Files created within the review's date window of the group's files, oldest first. They are
   * shown beside the group for building collections and are never duplicates.
   */
  nearby: (FileSchema & { tags: TagSchema[] })[];
  /** How many files the date window holds, of which at most a page's worth are listed. */
  nearbyCount: number;
  score: number;
}

interface ScanGroup {
  _id: string;
  /**
   * Each score is the file's visual similarity to the keeper. Variations look alike but differ
   * from the keeper beyond recompression or a watermark, so they're never selected for archiving
   * in bulk.
   */
  files: {
    /** Percentage of the image that differs from the keeper's, where their pixels were compared. */
    difference?: number;
    hash: string;
    id: string;
    isVariation?: boolean;
    score?: number;
  }[];
  /** Best-quality available file that member scores are measured against. */
  keeperId?: string;
  scanId: string;
  /** Highest member similarity to the keeper. */
  score: number;
}

/** A searched file's nearest files at or above the lowest selectable similarity. */
interface ScanMatch {
  _id: string;
  fileId: string;
  hash: string;
  matches: { hash: string; id: string; visual: number }[];
  scanId: string;
}

interface DuplicateScan {
  _id: string;
  cursor: string;
  elapsedMs: number;
  error: string;
  found: number;
  /** Last searched file whose matches have been grouped. */
  groupCursor: string;
  /** Why grouping stopped, kept apart from the search's own error. */
  groupError: string;
  /** Grouping was paused and waits to be resumed, keeping the groups built so far. */
  groupPaused?: boolean;
  /** Searched files with matches that have been grouped. */
  grouped: number;
  /**
   * How the groups were built. Groups from an older version, which raised the similarity of files
   * created close together or kept the largest file, are built again.
   */
  groupVersion: number;
  /** Searched files with at least one match. */
  matched: number;
  /** Review settings the groups are built with; the search itself ignores them. */
  options: DuplicateSearchOptions;
  processed: number;
  scope: string;
  skipped: number;
  sourceFileId: string;
  status: "complete" | "error" | "paused" | "running";
  total: number;
}

/** Grouping owns these fields, so the search never writes them. */
type GroupState = Pick<DuplicateScan, "found" | "groupCursor" | "groupError" | "grouped">;

interface GroupTask extends GroupState {
  claimedIds: Set<string>;
  /** Query for the files the filter chooses, apart from archived ones; null when every file passes. */
  filter: FilterQuery<FileSchema>;
  options: DuplicateSearchOptions;
  /** Grouping stops after its current step and keeps its progress. */
  paused: boolean;
  /** The search stored more matches while grouping looked for more. */
  pending: boolean;
  /** The review settings changed, so grouping starts over from the first match. */
  restart: boolean;
  /** Settles once this grouping pass has ended. */
  run: Promise<void>;
  /** Grouping work underway, which a starting search lets finish first. */
  step: Promise<unknown>;
  /** Resumes grouping that waited for searches to stop. */
  wake: () => void;
}

interface RunningQuery {
  isSettled: boolean;
  query: Promise<SearchedChunk>;
  /** Resolves once the query finishes either way, so waiting for any query never throws early. */
  settled: Promise<void>;
}

interface SearchedChunk {
  /** Last file read, where a resumed search continues. */
  cursor: string;
  matches: ScanMatch[];
  processed: number;
  skipped: number;
}

interface ScanTask {
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
  groupCursor: String,
  groupError: String,
  grouped: Number,
  groupPaused: Boolean,
  groupVersion: Number,
  matched: Number,
  options: {
    filter: String,
    minSimilarity: Number,
    searchProps: String,
    timeWindow: Number,
    variationBlockSize: Number,
    variationThreshold: Number,
  },
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
  files: [
    {
      _id: false,
      difference: Number,
      hash: String,
      id: String,
      isVariation: Boolean,
      score: Number,
    },
  ],
  keeperId: String,
  scanId: String,
  score: Number,
});

groupSchema.index({ scanId: 1, score: -1, _id: 1 });

// Matches are read in ID order through the shared record type and ID index.
const matchSchema = new Schema<ScanMatch>({
  _id: String,
  fileId: String,
  hash: String,
  matches: [{ _id: false, hash: String, id: String, visual: Number }],
  scanId: String,
});

// Record type names are persisted discriminators with indexes created during consolidation.
const ScanGroupModel = registerPersistenceModel<ScanGroup>("ImageCopyPair", groupSchema);
const ScanMatchModel = registerPersistenceModel<ScanMatch>("ImageCopyMatch", matchSchema);
const DuplicateScanModel = registerPersistenceModel<DuplicateScan>("ImageCopyScan", scanSchema);

const BATCH_SIZE = 512;
const GROUP_BATCH_SIZE = 512;
/**
 * Raised whenever groups are built differently: 2 scores visual similarity alone and keeps the
 * best quality by watermark and JPEG compression before file size; 3 releases files below the
 * threshold against the keeper and ranks compression only within all-JPEG groups; 4 marks files
 * that differ from the keeper in framing, colour, or content as variations; 5 keeps the video
 * with the most detail by resolution and bitrate together; 6 weights that bitrate by codec; 7
 * compares variations at a finer scale, marking small recoloured areas such as changed clothing;
 * 8 marks smaller changes and records how much of each file differs from the keeper; 9 matches
 * tones first and marks any edited area, letting exposure shifts and watermarks through.
 */
const GROUP_VERSION = 9;
/** Files created nearby that each group lists at most. */
const NEARBY_PAGE_SIZE = 50;
/** Queries started past the oldest unstored one, bounding the results held until it finishes. */
const QUERIES_AHEAD = 16;
/** Vector queries kept running at once. */
const QUERIES_IN_FLIGHT = 4;
const QUERY_SIZE = 128;

const fileProjection = { hash: 1, isArchived: 1, isCorrupted: 1 };

let starting = false;
const groupTasks = new Map<string, GroupTask>();
/** Each search's latest review settings save, which the next one waits for. */
const optionSaves = new Map<string, Promise<unknown>>();
const tasks = new Map<string, ScanTask>();

const isEligible = (file: { isArchived?: boolean; isCorrupted?: boolean }) =>
  !file.isArchived && !file.isCorrupted;

/** Matches sort by their searched file's ID, the order the search stores them in. */
const getMatchId = (scanId: string, fileId: string) => `${scanId}:match:${fileId}`;

/** Highest member similarity to the keeper. */
const getGroupScore = (files: ScanGroup["files"], keeperId: string) =>
  Math.max(0, ...files.filter((file) => file.id !== keeperId).map((file) => file.score));

const getGroupState = ({ found, groupCursor, groupError, grouped }: GroupState): GroupState => ({
  found,
  groupCursor,
  groupError,
  grouped,
});

const getScanState = (scan: DuplicateScan) => ({
  cursor: scan.cursor,
  elapsedMs: scan.elapsedMs,
  error: scan.error,
  matched: scan.matched,
  processed: scan.processed,
  skipped: scan.skipped,
  status: scan.status,
  total: scan.total,
});

const deleteScanRecords = async (scanId: string) => {
  // ";" sorts directly after ":", closing the range of this search's matches.
  await ScanMatchModel.deleteMany({
    _id: { $gt: getMatchId(scanId, ""), $lt: `${scanId}:match;` },
  });
  await ScanGroupModel.deleteMany({ scanId });
};

/**
 * Scores each group's files by their visual similarity to its best-quality available file. Every
 * searched file stored its nearest matches, so only pairs that neither file stored are scored from
 * their vectors.
 */
const scoreGroups = async (scanId: string, groups: Pick<ScanGroup, "_id" | "files">[]) => {
  const files = await FileModel.find({
    _id: { $in: groups.flatMap((group) => group.files.map((file) => file.id)) },
    isArchived: { $ne: true },
  })
    .select({
      bitrate: 1,
      duration: 1,
      ext: 1,
      height: 1,
      path: 1,
      size: 1,
      thumb: 1,
      videoCodec: 1,
      width: 1,
    })
    .lean();
  const byId = new Map(files.map((file) => [String(file._id), leanModelToJson<FileSchema>(file)]));
  const keeperIds: string[] = [];
  const variations: Awaited<ReturnType<typeof findVariations>>[] = [];
  const scan = await DuplicateScanModel.findById(scanId).select({ options: 1 }).lean();
  const variationSettings = getVariationSettings(scan?.options ?? {});

  // Groups are read in disk order, which each group's first thumbnail records, so the reads
  // underway at once stay close together on a hard drive.
  const orderedGroups = sortByStoredNtfsIdentity(
    groups.map((group, index) => ({ group, index })),
    ({ group }) => ({
      fileId: byId.get(group.files[0].id)?.thumb?.ntfsFileId,
      volumeId: byId.get(group.files[0].id)?.thumb?.ntfsVolumeId,
    }),
  );

  // Ranking reads each file's headers and may decode same-resolution images, then the kept file's
  // thumbnail is compared with the others', so groups share the work.
  await runConcurrent(orderedGroups, CONSTANTS.FILE.IO_CONCURRENCY, async ({ group, index }) => {
    const available = group.files
      .filter((file) => byId.has(file.id))
      .map((file) => byId.get(file.id));

    keeperIds[index] = available.length
      ? (await rankDuplicateQuality(available))[0].id
      : group.files[0].id;
    variations[index] = byId.has(keeperIds[index])
      ? await findVariations(byId.get(keeperIds[index]), available, variationSettings)
      : new Map();
  });

  const storedIds = [...new Set([...keeperIds, ...groups.map((group) => group.files[0].id)])];
  const storedMatches = await ScanMatchModel.find({
    _id: { $in: storedIds.map((fileId) => getMatchId(scanId, fileId)) },
  })
    .select({ fileId: 1, matches: 1 })
    .lean();
  const storedScores = new Map(
    storedMatches.map((doc) => [
      doc.fileId,
      new Map(doc.matches.map((match) => [match.id, match.visual])),
    ]),
  );

  // Similarity is symmetric, so either file's stored matches can hold the pair.
  const getStoredScore = (referenceId: string, fileId: string) =>
    referenceId === fileId
      ? 100
      : (storedScores.get(referenceId)?.get(fileId) ?? storedScores.get(fileId)?.get(referenceId));

  const scores = groups.map((group, index) =>
    Object.fromEntries(
      group.files.map((file) => [file.id, getStoredScore(keeperIds[index], file.id)]),
    ),
  );
  const unscored = groups
    .map((group, index) => ({
      fileIds: group.files.map((file) => file.id).filter((id) => scores[index][id] === undefined),
      index,
      referenceId: keeperIds[index],
    }))
    .filter((group) => group.fileIds.length);

  if (unscored.length) {
    const vectorScores = await vectorTrpc.scoreFileSimilarities.mutate({
      groups: unscored.map(({ fileIds, referenceId }) => ({ fileIds, referenceId })),
    });

    for (const [position, { index }] of unscored.entries())
      Object.assign(scores[index], vectorScores[position]);
  }

  return groups.map((group, index) => {
    const scoredFiles = group.files.map((file) => ({
      hash: file.hash,
      id: file.id,
      ...(typeof variations[index].get(file.id)?.difference === "number"
        ? { difference: variations[index].get(file.id).difference }
        : {}),
      ...(variations[index].get(file.id)?.isVariation ? { isVariation: true } : {}),
      score: round(scores[index][file.id] ?? 0, 1),
    }));

    return {
      files: scoredFiles,
      keeperId: keeperIds[index],
      score: getGroupScore(scoredFiles, keeperIds[index]),
    };
  });
};

/** The library search's variation settings, which single-file lookups mark variations with too. */
export const getLibraryVariationSettings = async () =>
  getVariationSettings(
    (await DuplicateScanModel.findOne({ scope: "library" }).select({ options: 1 }).lean())
      ?.options ?? {},
  );

/**
 * The query for the files a saved filter menu chooses; null when every file passes. Callers skip
 * archived and corrupted files themselves, so the filter can't choose them, and its remaining
 * archived check is dropped because it would also exclude files missing the field.
 */
export const getFileFilterMatch = async (filter: string | null) => {
  const match: FilterQuery<FileSchema> = filter
    ? (
        await actions.createFileFilterPipeline({
          ...JSON.parse(filter),
          isArchived: false,
          isCorrupted: null,
        })
      ).$match
    : {};

  delete match.isArchived;

  return Object.keys(match).length ? match : null;
};

/** Compares review filters by the files they choose, writing IDs as hex and patterns as text. */
const getGroupFilterKey = async (filter: string | null) =>
  JSON.stringify(await getFileFilterMatch(filter), (_, value) =>
    value instanceof RegExp ? String(value) : value,
  );

/** Loads the review settings, starting over when they changed or keeping the groups built so far. */
const prepareGrouping = async (scanId: string, task: GroupTask) => {
  // A restart requested while the settings load is picked up by the next pass.
  const isRestart = task.restart;
  task.restart = false;

  if (isRestart) {
    task.claimedIds = new Set();
    task.found = 0;
    task.groupCursor = "";
    task.grouped = 0;
  }

  const scan = await DuplicateScanModel.findById(scanId)
    .select({ groupCursor: 1, grouped: 1, options: 1 })
    .lean();
  if (!scan) throw new Error("Duplicate search not found.");

  // Groups an earlier pass was still writing when the settings changed are removed too.
  if (isRestart) await ScanGroupModel.deleteMany({ scanId });
  else {
    const groups = await ScanGroupModel.find({ scanId }).select({ files: 1 }).lean();

    task.claimedIds = new Set(groups.flatMap((group) => group.files.map((file) => file.id)));
    task.found = groups.length;
    task.groupCursor = scan.groupCursor;
    task.grouped = scan.grouped;
  }

  task.filter = await getFileFilterMatch(scan.options.filter);
  task.groupError = "";
  task.options = scan.options;

  await DuplicateScanModel.updateOne({ _id: scanId }, { $set: getGroupState(task) });
};

/**
 * Forms groups from stored matches in search order. Each file joins the first group that claims
 * it, keeping matches that pass the review settings.
 */
const formGroups = async (scanId: string, task: GroupTask, docs: ScanMatch[]) => {
  const fileIds = [
    ...new Set(docs.flatMap((doc) => [doc.fileId, ...doc.matches.map((match) => match.id)])),
  ];
  const [files, filteredFiles] = await Promise.all([
    FileModel.find({ _id: { $in: fileIds } })
      .select(fileProjection)
      .lean(),
    task.filter
      ? FileModel.find({ $and: [task.filter, { _id: { $in: fileIds } }] })
          .select({ _id: 1 })
          .lean()
      : null,
  ]);
  const byId = new Map(files.filter(isEligible).map((file) => [String(file._id), file]));
  const filteredIds = filteredFiles && new Set(filteredFiles.map((file) => String(file._id)));
  const groups: Pick<ScanGroup, "_id" | "files" | "scanId">[] = [];

  const isFiltered = (fileId: string) => !filteredIds || filteredIds.has(fileId);

  for (const doc of docs) {
    const source = byId.get(doc.fileId);

    // A changed hash means the match was found for an older version of the file.
    if (source?.hash === doc.hash && isFiltered(doc.fileId) && !task.claimedIds.has(doc.fileId)) {
      const matches = doc.matches.filter(
        (match) =>
          byId.get(match.id)?.hash === match.hash &&
          match.visual >= task.options.minSimilarity &&
          !task.claimedIds.has(match.id) &&
          isFiltered(match.id),
      );

      if (matches.length) {
        const groupFiles = [
          { hash: doc.hash, id: doc.fileId },
          ...matches.map(({ hash, id }) => ({ hash, id })),
        ];

        groups.push({ _id: `${scanId}:${doc.fileId}`, files: groupFiles, scanId });

        for (const file of groupFiles) task.claimedIds.add(file.id);
      }
    }
  }

  return groups;
};

/**
 * Scores groups against their keepers. Files matched through the searched file but below the
 * threshold against the keeper would be hidden in the review, so they are released for other
 * groups to claim instead.
 */
const keepGroups = async (
  scanId: string,
  task: GroupTask,
  groups: Pick<ScanGroup, "_id" | "files" | "scanId">[],
) => {
  const releasedIds: string[] = [];
  const scored = groups.length ? await scoreGroups(scanId, groups) : [];

  const keptGroups = groups.flatMap((group, index) => {
    const { files, keeperId } = scored[index];
    const kept = files.filter(
      (file) => file.id === keeperId || file.score >= task.options.minSimilarity,
    );
    const released = kept.length > 1 ? files.filter((file) => !kept.includes(file)) : files;

    for (const file of released) {
      task.claimedIds.delete(file.id);
      releasedIds.push(file.id);
    }

    return kept.length > 1
      ? [{ ...group, files: kept, keeperId, score: getGroupScore(kept, keeperId) }]
      : [];
  });

  return { keptGroups, releasedIds };
};

/** Groups the next stored matches the search has finished, in search order. */
const groupBatch = async (scanId: string, task: GroupTask, through: string) => {
  const docs = await ScanMatchModel.find({
    _id: { $gt: getMatchId(scanId, task.groupCursor), $lte: getMatchId(scanId, through) },
  })
    .sort({ _id: 1 })
    .limit(GROUP_BATCH_SIZE)
    .lean();
  if (!docs.length) return false;

  const lastMatchId = getMatchId(scanId, docs[docs.length - 1].fileId);
  const groups = await formGroups(scanId, task, docs);

  // Groups built with replaced settings would only be deleted again.
  if (task.restart) return true;

  const { keptGroups, releasedIds } = await keepGroups(scanId, task, groups);

  if (task.restart) return true;

  // Released files whose own matches were already grouped get one more chance to form a group;
  // later ones form theirs when the grouping reaches them.
  const passedIds = releasedIds.filter((fileId) => getMatchId(scanId, fileId) <= lastMatchId);

  if (passedIds.length) {
    const retryDocs = await ScanMatchModel.find({
      _id: { $in: passedIds.map((fileId) => getMatchId(scanId, fileId)) },
    })
      .sort({ _id: 1 })
      .lean();
    const retried = await keepGroups(scanId, task, await formGroups(scanId, task, retryDocs));

    if (task.restart) return true;

    keptGroups.push(...retried.keptGroups);
  }

  if (keptGroups.length) {
    const result = await ScanGroupModel.bulkWrite(
      keptGroups.map(({ _id, ...group }) => ({
        updateOne: { filter: { _id }, update: { $set: group }, upsert: true },
      })),
      { ordered: false },
    );

    task.found += result.upsertedCount;
  }

  task.groupCursor = docs[docs.length - 1].fileId;
  task.grouped += docs.length;

  await DuplicateScanModel.updateOne({ _id: scanId }, { $set: getGroupState(task) });

  return true;
};

const isSearching = () => starting || tasks.size > 0;

/** Groups the next stored matches, unless a search started while the search's progress loaded. */
const groupNextBatch = async (scanId: string, task: GroupTask) => {
  const through = (await DuplicateScanModel.findById(scanId).select({ cursor: 1 }).lean())?.cursor;

  return !!through && !isSearching() && (await groupBatch(scanId, task, through));
};

const wakeGrouping = () => {
  for (const task of groupTasks.values()) task.wake?.();
};

/**
 * Groups the stored matches while no search runs, so the review never slows a search down;
 * grouping waits again whenever one starts. Only clearing groups for changed settings, which the
 * settings change already deleted, runs while a search does.
 */
const runGrouping = async (scanId: string, task: GroupTask) => {
  let isPrepared = false;

  try {
    // Paused grouping stays paused; settings changed meanwhile already cleared the groups.
    task.paused ||= !!(await DuplicateScanModel.findById(scanId).select({ groupPaused: 1 }).lean())
      ?.groupPaused;

    while (!serverShutdownSignal.aborted && !task.paused) {
      if (task.restart) {
        task.step = prepareGrouping(scanId, task);
        await task.step;
        isPrepared = true;
      } else if (isSearching()) {
        await new Promise<void>((resolve) => {
          task.wake = resolve;
        });
      } else if (!isPrepared) {
        task.step = prepareGrouping(scanId, task);
        await task.step;
        isPrepared = true;
      } else {
        task.pending = false;
        task.step = groupNextBatch(scanId, task);

        const hasGrouped = await task.step;

        // A search starting during the batch's read leaves it for the wait above.
        if (!hasGrouped && !task.pending && !task.restart && !isSearching()) break;
      }
    }
  } catch (error) {
    task.groupError = error.message;

    await DuplicateScanModel.updateOne({ _id: scanId }, { $set: { groupError: error.message } });
  } finally {
    groupTasks.delete(scanId);

    // Settings changed while this pass was ending still get their groups, unless it was paused.
    if (task.restart && !task.paused && !serverShutdownSignal.aborted) startGrouping(scanId, true);
  }
};

/** Groups newly stored matches, or starts over when the review settings changed. */
const startGrouping = (scanId: string, restart = false) => {
  const running = groupTasks.get(scanId);

  if (running) {
    running.pending = true;
    running.restart ||= restart;
    running.wake?.();
  } else {
    const task: GroupTask = {
      claimedIds: new Set(),
      filter: null,
      found: 0,
      groupCursor: "",
      groupError: "",
      grouped: 0,
      options: null,
      paused: false,
      pending: false,
      restart,
      run: null,
      step: null,
      wake: null,
    };

    groupTasks.set(scanId, task);
    task.run = runGrouping(scanId, task).catch(console.error);
  }
};

const readFiles = (scan: DuplicateScan, cursor: string) =>
  FileModel.find(
    scan.sourceFileId ? { _id: scan.sourceFileId } : cursor ? { _id: { $gt: cursor } } : {},
  )
    .select(fileProjection)
    .sort({ _id: 1 })
    .limit(BATCH_SIZE)
    .lean()
    .exec();

type SearchFile = Awaited<ReturnType<typeof readFiles>>[number];

/**
 * Reads the files to search in ID order after the search's cursor, handing out one vector query's
 * files at a time and reading each batch while the one before it is searched.
 */
const makeChunkReader = (task: ScanTask) => {
  const { scan } = task;

  let chunks: SearchFile[][] = [];
  let isReadToEnd = false;
  let nextRead = readFiles(scan, scan.cursor);

  // A failed read surfaces when its files are needed.
  nextRead.catch(() => null);

  return async () => {
    if (!chunks.length && !isReadToEnd) {
      const files = await nextRead;

      if (scan.sourceFileId && !files.some(isEligible))
        throw new Error("This file is archived, corrupted, or no longer available.");

      chunks = chunkArray(files, QUERY_SIZE);
      isReadToEnd = !!scan.sourceFileId || files.length < BATCH_SIZE;

      if (!isReadToEnd) {
        nextRead = readFiles(scan, String(files[files.length - 1]._id));
        nextRead.catch(() => null);
      }
    }

    return chunks.shift() ?? null;
  };
};

/** Finds each file's nearest matches; which of them form groups is decided while reviewing. */
const searchChunk = async (task: ScanTask, files: SearchFile[]): Promise<SearchedChunk> => {
  const { scan } = task;

  const sources = files
    .filter(isEligible)
    .map((file) => ({ fileId: String(file._id), hash: file.hash }));
  const hashes = new Map(sources.map((file) => [file.fileId, file.hash]));
  const results = sources.length
    ? await vectorTrpc.findDuplicateCandidates.mutate(
        {
          files: sources,
          minSimilarity: MIN_DUPLICATE_SIMILARITY,
          useSearchIndex: !scan.sourceFileId,
        },
        { signal: task.controller.signal },
      )
    : [];
  const matches: ScanMatch[] = [];
  let skipped = 0;

  for (const result of results) {
    if (!result.indexed) skipped++;
    else if (result.candidates.length) {
      matches.push({
        _id: getMatchId(scan._id, result.fileId),
        fileId: result.fileId,
        hash: hashes.get(result.fileId),
        matches: result.candidates.map((match) => ({
          hash: match.hash,
          id: match.fileId,
          visual: match.score,
        })),
        scanId: scan._id,
      });
    }
  }

  return {
    cursor: String(files[files.length - 1]._id),
    matches,
    processed: files.length,
    skipped,
  };
};

/** Stores searched chunks in search order, then moves the search past them for resuming. */
const storeChunks = async (task: ScanTask, chunks: SearchedChunk[], isLast: boolean) => {
  const { scan } = task;

  const matches = chunks.flatMap((chunk) => chunk.matches);

  if (matches.length) {
    const result = await ScanMatchModel.bulkWrite(
      matches.map(({ _id, ...match }) => ({
        updateOne: { filter: { _id }, update: { $set: match }, upsert: true },
      })),
      { ordered: false },
    );

    scan.matched += result.upsertedCount;
  }

  for (const chunk of chunks) {
    scan.cursor = chunk.cursor;
    scan.processed += chunk.processed;
    scan.skipped += chunk.skipped;
  }

  if (isLast) scan.status = "complete";

  await DuplicateScanModel.updateOne(
    { _id: scan._id },
    { $set: { ...getScanState(scan), elapsedMs: scan.elapsedMs + Date.now() - task.startedAt } },
  );
};

/**
 * Keeps a fixed number of vector queries running, starting another as soon as any finishes unless
 * too many finished ones wait behind an unfinished one, while finished ones are stored in search
 * order. Writes run one at a time alongside the queries.
 */
const searchAndStore = async (task: ScanTask) => {
  const { signal } = task.controller;

  const readChunk = makeChunkReader(task);
  const queries: RunningQuery[] = [];
  let hasWriteFailed = false;
  let isRead = false;
  let queuedWrites = 0;
  let searched: SearchedChunk[] = [];
  let storing: Promise<void> = null;

  const startQuery = (files: SearchFile[]) => {
    const query = searchChunk(task, files);
    const running: RunningQuery = { isSettled: false, query, settled: null };

    running.settled = (async () => {
      await Promise.allSettled([query]);
      running.isSettled = true;
    })();

    return running;
  };

  const startQueries = async () => {
    while (
      !isRead &&
      !signal.aborted &&
      queries.length < QUERIES_AHEAD &&
      queries.filter((query) => !query.isSettled).length < QUERIES_IN_FLIGHT
    ) {
      const files = await readChunk();

      if (!files) isRead = true;
      else if (!signal.aborted) queries.push(startQuery(files));
    }
  };

  try {
    await startQueries();

    while (queries.length) {
      signal.throwIfAborted();

      if (!queries[0].isSettled)
        await Promise.race(
          queries.filter((query) => !query.isSettled).map((query) => query.settled),
        );

      // Finished queries are stored in search order, so one ahead of an unfinished one waits.
      while (queries[0]?.isSettled) searched.push(await queries.shift().query);

      await startQueries();

      if (searched.reduce((count, chunk) => count + chunk.processed, 0) >= BATCH_SIZE) {
        // Writes queue behind each other, so the search's cursor only moves forward. Searching
        // waits for them once two are queued, which bounds the results held in memory, and a
        // failed write stops it here rather than after searching the rest of the library.
        if (queuedWrites >= 2 || hasWriteFailed) await storing;

        const chunks = searched;
        const previous = storing;

        searched = [];
        queuedWrites++;

        storing = (async () => {
          try {
            await previous;
            await storeChunks(task, chunks, false);
          } finally {
            queuedWrites--;
          }
        })();

        storing.catch(() => {
          hasWriteFailed = true;
        });
      }
    }

    // Stopping before any query started also ends the loop, and must not complete the search.
    signal.throwIfAborted();

    await storing;
    await storeChunks(task, searched, true);
  } finally {
    // Queries and writes still running when the search stops settle before it ends.
    await Promise.allSettled([storing, ...queries.map((query) => query.query)]);
  }
};

const runScan = async (task: ScanTask) => {
  const { scan } = task;
  const signal = task.controller.signal;

  const abort = () => task.controller.abort(serverShutdownSignal.reason);

  serverShutdownSignal.addEventListener("abort", abort, { once: true });

  try {
    if (serverShutdownSignal.aborted) abort();

    signal.throwIfAborted();

    if (!scan.sourceFileId && !(await vectorTrpc.getSearchIndexStatus.mutate()).hasIndex)
      throw new Error(
        "Searching the whole library requires the similarity search index. Build it in Settings → Repair, then search again.",
      );

    scan.total = scan.sourceFileId ? 1 : await FileModel.estimatedDocumentCount();

    await searchAndStore(task);
  } catch (error) {
    scan.status = signal.aborted ? "paused" : "error";
    scan.error = signal.aborted ? "" : error.message;
  } finally {
    serverShutdownSignal.removeEventListener("abort", abort);
    scan.elapsedMs += Date.now() - task.startedAt;

    try {
      await DuplicateScanModel.updateOne({ _id: scan._id }, { $set: getScanState(scan) });
    } finally {
      tasks.delete(scan._id);
      startGrouping(scan._id);
      wakeGrouping();
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

  // Searches saved by the retired pixel-comparison finder, or that grouped files while searching,
  // kept no matches to regroup.
  if ("pixelTolerance" in saved.options || !("groupCursor" in saved)) {
    await deleteScanRecords(saved._id);
    await DuplicateScanModel.deleteOne({ _id: saved._id });

    return null;
  }

  // Groups built by an older version are built again, once nothing is archiving from them.
  if (saved.groupVersion !== GROUP_VERSION && !findJob("mergeDuplicates", saved._id)) {
    await DuplicateScanModel.updateOne(
      { _id: saved._id },
      {
        $set: {
          found: 0,
          groupCursor: "",
          groupError: "",
          grouped: 0,
          groupVersion: GROUP_VERSION,
        },
      },
    );
    await ScanGroupModel.deleteMany({ scanId: saved._id });
    startGrouping(saved._id, true);
  }

  const task = tasks.get(saved._id);
  const scan = task?.scan ?? saved;

  if (!task && !starting && scan.status === "running") {
    scan.status = "paused";

    await DuplicateScanModel.updateOne({ _id: scan._id }, { $set: { status: "paused" } });
  }

  // Grouping interrupted by a restart resumes from the last match it grouped once no search runs.
  // Failed grouping waits for the review settings to be applied again, and paused grouping for
  // its resume.
  if (
    !isSearching() &&
    !groupTasks.has(saved._id) &&
    !findJob("mergeDuplicates", saved._id) &&
    !saved.groupError &&
    !saved.groupPaused &&
    scan.cursor &&
    (await ScanMatchModel.exists({
      _id: {
        $gt: getMatchId(saved._id, saved.groupCursor),
        $lte: getMatchId(saved._id, scan.cursor),
      },
    })) &&
    // A search may have started during the lookup.
    !isSearching()
  )
    startGrouping(saved._id);

  const groupTask = groupTasks.get(saved._id);
  const groupState = groupTask?.restart
    ? { found: 0, groupCursor: "", groupError: "", grouped: 0 }
    : groupTask?.options
      ? getGroupState(groupTask)
      : getGroupState(saved);

  return {
    ...scan,
    ...groupState,
    elapsedMs: scan.elapsedMs + (task ? Date.now() - task.startedAt : 0),
    error: scan.error || groupState.groupError,
    // Grouping only runs while no search does.
    isGrouping: !!groupTask && !groupTask.paused && !isSearching(),
    isGroupingPaused: !!saved.groupPaused,
    options: saved.options,
    status: task ? ("running" as const) : scan.status,
  };
};

export const isDuplicateScanGrouping = (scanId: string) => groupTasks.has(scanId);

/** Settles once the grouping steps underway have finished. */
export const waitForDuplicateGroupingSteps = () =>
  Promise.allSettled([...groupTasks.values()].map((groupTask) => groupTask.step));

export const pauseDuplicateScan = async (scanId: string) => {
  const task = tasks.get(scanId);

  task?.controller.abort();
  await task?.promise;
};

/**
 * Pauses grouping after its current step, keeping the groups built so far for review and
 * archiving. It stays paused, including across restarts, until resumed.
 */
export const pauseDuplicateGrouping = async (scanId: string) => {
  await DuplicateScanModel.updateOne({ _id: scanId }, { $set: { groupPaused: true } });

  const task = groupTasks.get(scanId);
  if (!task) return;

  task.paused = true;
  task.wake?.();

  await task.run;
};

/** Resumes paused grouping from the last match it grouped, once no search runs. */
export const resumeDuplicateGrouping = async (scanId: string) => {
  await DuplicateScanModel.updateOne({ _id: scanId }, { $set: { groupPaused: false } });

  // A pass still stopping for the pause ends first, so the resumed pass isn't folded into it.
  await groupTasks.get(scanId)?.run;

  startGrouping(scanId);
};

/**
 * Saves the review settings, regrouping the stored matches only when grouping depends on them.
 * Grouping that failed is retried from where it stopped.
 */
const saveDuplicateReviewOptions = async (scanId: string, options: DuplicateSearchOptions) => {
  validateDuplicateSearchOptions(options);

  const scan = await DuplicateScanModel.findById(scanId)
    .select({ groupError: 1, options: 1 })
    .lean();
  if (!scan) throw new Error("Duplicate search not found.");

  // The filter menu's own settings only restore the menu, filters that choose the same files keep
  // the groups, and the date window only lists nearby files beside them. Variations are marked as
  // groups are built, so their settings regroup. Searches saved with the retired "Only match
  // filtered files" option regroup.
  const savedVariations = getVariationSettings(scan.options);
  const variations = getVariationSettings(options);
  const isRegrouping =
    "withinFilter" in scan.options ||
    scan.options.minSimilarity !== options.minSimilarity ||
    savedVariations.blockSize !== variations.blockSize ||
    savedVariations.threshold !== variations.threshold ||
    (await getGroupFilterKey(scan.options.filter)) !== (await getGroupFilterKey(options.filter));

  if (isRegrouping && findJob("mergeDuplicates", scanId))
    throw new Error(
      "Wait for the selected duplicates to be archived before changing these settings.",
    );

  // Groups built with the old settings are removed now, even while a search runs and grouping waits,
  // so the review never shows them and a restart cannot continue from their progress.
  await DuplicateScanModel.updateOne(
    { _id: scanId },
    {
      $set: {
        options: { ...options },
        ...(isRegrouping ? { found: 0, groupCursor: "", groupError: "", grouped: 0 } : {}),
      },
    },
  );

  const isRetrying = !isRegrouping && !!scan.groupError;

  if (isRegrouping) {
    await ScanGroupModel.deleteMany({ scanId });
    startGrouping(scanId, true);
  } else if (isRetrying) startGrouping(scanId);

  return { isGrouping: isRegrouping || isRetrying, isRegrouping };
};

/**
 * Saves each search's review settings one after another, so a save never compares against
 * settings an earlier save is still replacing.
 */
export const setDuplicateReviewOptions = (scanId: string, options: DuplicateSearchOptions) => {
  const save = (optionSaves.get(scanId) ?? Promise.resolve())
    .catch(() => null)
    .then(() => saveDuplicateReviewOptions(scanId, options));

  optionSaves.set(scanId, save);
  save
    .finally(() => {
      if (optionSaves.get(scanId) === save) optionSaves.delete(scanId);
    })
    .catch(() => null);

  return save;
};

/** Resumes a paused or stopped search; a completed one searches again from the start. */
export const startDuplicateScan = async (
  options: DuplicateSearchOptions,
  sourceFileId?: string,
) => {
  validateDuplicateSearchOptions(options);

  if (starting || tasks.size)
    throw new Error(
      [...tasks.values()].some((task) => task.scan.sourceFileId)
        ? "A Find Variants search is still running. Open Find Variants on its file to pause it, or wait for it to finish."
        : "Pause the current duplicate search before starting another.",
    );

  starting = true;

  try {
    // Grouping already underway finishes its step first, so it never runs alongside the search.
    await waitForDuplicateGroupingSteps();

    const scope = sourceFileId || "library";
    let scan = await DuplicateScanModel.findOne({ scope }).lean();

    if (!scan || scan.status === "complete" || !("groupCursor" in scan)) {
      if (scan && findJob("mergeDuplicates", scan._id))
        throw new Error("Wait for the selected duplicates to be archived before searching again.");

      if (scan) await deleteScanRecords(scan._id);

      scan = {
        _id: scan?._id ?? randomUUID(),
        cursor: "",
        elapsedMs: 0,
        error: "",
        found: 0,
        groupCursor: "",
        groupError: "",
        grouped: 0,
        groupVersion: GROUP_VERSION,
        matched: 0,
        options: { ...options },
        processed: 0,
        scope,
        skipped: 0,
        sourceFileId: sourceFileId ?? null,
        status: "running",
        total: 0,
      };

      await DuplicateScanModel.replaceOne({ _id: scan._id }, scan, { upsert: true });
      startGrouping(scan._id, true);
    } else {
      // Grouping after the resumed search would count groups the archive is still removing.
      if (findJob("mergeDuplicates", scan._id))
        throw new Error("Wait for the selected duplicates to be archived before resuming.");

      scan.error = "";
      scan.status = "running";

      await DuplicateScanModel.updateOne(
        { _id: scan._id },
        { $set: { error: "", status: "running" } },
      );
      await setDuplicateReviewOptions(scan._id, options);
    }

    const task: ScanTask = {
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

    // Grouping that waited for this start resumes if the search failed to start.
    wakeGrouping();
  }
};

export const getDuplicateScanGroupsById = (scanId: string, groupIds: string[]) =>
  ScanGroupModel.find({ _id: { $in: groupIds }, scanId }).lean();

/** Groups with a member at or above the review threshold. */
export const listDuplicateScanGroups = (scanId: string, minSimilarity: number) =>
  ScanGroupModel.find({ scanId, score: { $gte: minSimilarity } })
    .select({ files: 1, keeperId: 1 })
    .lean();

export const getDuplicateScanGroups = async (
  scanId: string,
  page: number,
  minSimilarity: number,
) => {
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
 * For each group, the files created within the date window of any of its files, oldest first,
 * apart from the group's own. Like grouped files, they pass the review filter and are neither
 * archived nor corrupted. Similarity plays no part.
 */
export const listNearbyFiles = async (
  scanId: string,
  groups: Pick<FileSchema, "dateCreated" | "id">[][],
  timeWindow: number,
) => {
  const scan = await DuplicateScanModel.findById(scanId).select({ options: 1 }).lean();
  const filter = await getFileFilterMatch(scan?.options.filter ?? null);

  return Promise.all(
    groups.map(async (files) => {
      // Overlapping windows merge into one range each, keeping the query small for close files.
      const ranges: { end: number; start: number }[] = [];
      const times = files
        .filter((file) => file.dateCreated)
        .map((file) => dayjs(file.dateCreated).valueOf())
        .sort((a, b) => a - b);

      for (const time of times) {
        const end = time + timeWindow * 60_000;
        const last = ranges.at(-1);

        if (last && time - timeWindow * 60_000 <= last.end) last.end = end;
        else ranges.push({ end, start: time - timeWindow * 60_000 });
      }

      if (!ranges.length) return { count: 0, files: [] as FileSchema[] };

      const windows = ranges.map(({ end, start }) => ({
        dateCreated: { $gte: dayjs(start).toISOString(), $lte: dayjs(end).toISOString() },
      }));

      const query: FilterQuery<FileSchema> = {
        $and: [
          ...(filter ? [filter] : []),
          { $or: windows },
          {
            _id: { $nin: files.map((file) => file.id) },
            isArchived: { $ne: true },
            isCorrupted: { $ne: true },
          },
        ],
      };
      const [count, nearby] = await Promise.all([
        FileModel.countDocuments(query),
        FileModel.find(query).sort({ dateCreated: 1, _id: 1 }).limit(NEARBY_PAGE_SIZE).lean(),
      ]);

      return { count, files: nearby.map((file) => leanModelToJson<FileSchema>(file)) };
    }),
  );
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
    ? await scoreGroups(
        scanId,
        rescored.map((update) => ({ _id: update.group._id, files: update.files })),
      )
    : [];
  const updated = new Map<string, Pick<ScanGroup, "files" | "keeperId" | "score">>([
    ...kept.map((update): [string, Pick<ScanGroup, "files" | "keeperId" | "score">] => [
      update.group._id,
      {
        files: update.files,
        keeperId: update.group.keeperId,
        score: getGroupScore(update.files, update.group.keeperId),
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
    const groupTask = groupTasks.get(scanId);

    if (result.deletedCount) {
      // Regrouping may have already reset the count these groups were part of.
      if (groupTask) groupTask.found = Math.max(0, groupTask.found - result.deletedCount);

      await DuplicateScanModel.updateOne(
        { _id: scanId },
        { $inc: { found: -result.deletedCount } },
      );
    }
  }

  return updated;
};
