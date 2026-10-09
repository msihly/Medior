import fs from "fs/promises";
import path from "path";
import { Field, FixedSizeList, Float16, Float32, Schema, Utf8 } from "apache-arrow";
import { randomUUID } from "crypto";
import * as models from "medior/_generated/server/models";
import { availableParallelism } from "os";
import { fileLog } from "trabecula/utils/server";
import { storeThumbnailNtfsMetadata } from "medior/server/database/actions/files";
import { runBackgroundExecution } from "medior/server/database/background-execution";
import { isPersistenceReady } from "medior/server/database/persistence";
import {
  SimilarityBackfillArgs,
  SimilarityBackfillModel,
} from "medior/server/database/similarity-backfill";
import { ThumbnailNtfsMetadata } from "medior/server/database/types";
import { checkServerShutdown, isServerStopping } from "medior/server/process-lifecycle";
import { chunkArray, CONSTANTS, round } from "medior/utils/common";
import { getConfig, getIsAnimated } from "medior/utils/server/config";
import { runImageTask } from "medior/utils/server/image-task";
import { runNativeTask } from "medior/utils/server/native-task";
import { getNtfsFileIdentity } from "medior/utils/server/ntfs";
import { getScaledThumbSize } from "medior/utils/server/videos";
import { runConcurrent, workSignal } from "medior/utils/server/work-signal";

export type VectorScope = "file" | "region" | "segment";

export type VectorTableStatus = "active" | "backfilling" | "deprecated";

export type SimilarityVectorType =
  | "audio"
  | "description"
  | "face"
  | "params"
  | "tags"
  | "transcript"
  | "visual";

export type VectorDType = "float16" | "float32";

export type VectorDistanceType = "cosine";

export type VectorIndexType = "ivf_pq" | "none";

export type VectorSourceKind =
  | "audioSegmentHash"
  | "descriptionHash"
  | "faceRegionHash"
  | "fileHash"
  | "paramsHash"
  | "tagsHash"
  | "transcriptHash";

export interface VectorTableManifestEntry {
  dimensions: number;
  distanceType: VectorDistanceType;
  indexType: VectorIndexType;
  modelId: string;
  scope: VectorScope;
  sourceKind: VectorSourceKind;
  status: VectorTableStatus;
  tableName: string;
  vectorDType: VectorDType;
  vectorType: SimilarityVectorType;
  vectorVersion: string;
}

export interface VectorManifest {
  activeTables: Partial<Record<SimilarityVectorType, string>>;
  tables: Record<string, VectorTableManifestEntry>;
  version: number;
}

export interface SimilarityBackfillTimings {
  decodeMs: number;
  existingRowsMs: number;
  indexMs: number;
  inferenceMs: number;
  mongoMs: number;
  sourcePrepMs: number;
  totalMs: number;
  vectorPostMs: number;
  writeMs: number;
}

export interface SimilarityDecodeDiagnostics {
  estimatedPixelCount: number;
  imageCount: number;
  imageMs: number;
  videoCount: number;
  videoMs: number;
}

export type SimilarityBackfillStage =
  | "cancelled"
  | "complete"
  | "decoding"
  | "error"
  | "idle"
  | "indexing"
  | "inferencing"
  | "migrating"
  | "optimizing"
  | "ordering"
  | "scanning"
  | "writing";

export type SimilarityBackfillStatus = "cancelled" | "complete" | "error" | "queued" | "running";

export interface SimilarityBackfillProgress {
  averageRate: number;
  completedAt?: number;
  currentRate: number;
  decodeDiagnostics: SimilarityDecodeDiagnostics;
  errorCount: number;
  index: number;
  indexedCount: number;
  jobId: string;
  message?: string;
  migratedCount: number;
  missingFileCount: number;
  missingThumbCount: number;
  orderingIndex: number;
  orderingTotal: number;
  skippedFreshCount: number;
  stage: SimilarityBackfillStage;
  startedAt: number;
  status: SimilarityBackfillStatus;
  timings: SimilarityBackfillTimings;
  total: number;
  unsupportedFileTypeCount: number;
  updatedAt: number;
  vectorTypes: SimilarityVectorType[];
}

interface VisualSourceItem {
  entityId: string;
  estimatedPixelCount: number;
  fileId: string;
  kind: "image" | "video";
  ntfsFileId?: string;
  ntfsVolumeId?: string;
  sourceHash: string;
  sourcePath: string;
}

interface VisualSourceOrderItem {
  ntfsFileId?: bigint;
  ntfsVolumeId?: bigint;
  sourceItem: VisualSourceItem;
  volumeRoot: string;
}

interface VisualDecodedItem extends VisualSourceItem {
  channels: 3;
  data: Uint8ClampedArray;
  height: number;
  width: number;
}

type LanceConnection = import("@lancedb/lancedb").Connection;

type LanceModule = typeof import("@lancedb/lancedb");

type LanceTable = import("@lancedb/lancedb").Table;

interface SimilarityBackfillJob {
  abortController: AbortController;
  cancelRequested: boolean;
  execution?: Promise<void>;
  pauseRequested: boolean;
  progress: SimilarityBackfillProgress;
  reportedErrorCount?: number;
}

interface SimilarityIndexBatchResult {
  errorCount: number;
  fileCount: number;
  indexedCount: number;
  migratedCount: number;
  missingFileCount: number;
  missingThumbCount: number;
  skippedFreshCount: number;
  timings: SimilarityBackfillTimings;
  unsupportedFileTypeCount: number;
}

interface DuplicateMatch {
  fileId: string;
  hash: string;
  score: number;
}

interface DuplicateSource {
  fileId: string;
  vector: Float32Array;
}

interface SimilaritySearchIndexBuild {
  controller: AbortController;
  error: string;
  isUpdate: boolean;
  message: string;
  percent: number | null;
  startedAt: number;
  status: "cancelled" | "complete" | "error" | "running";
}

const DEFAULT_SCAN_WINDOW_SIZE = 50_000;
// Percentage points below the threshold at which quantized index distances are re-scored exactly.
const DUPLICATE_QUANTIZATION_MARGIN = 5;
const MANIFEST_FILE_NAME = "manifest.json";
const MAX_CONCURRENT_VECTOR_ROW_QUERIES = 10;
const MAX_DUPLICATE_CANDIDATES = 32;
const MAX_FILE_ID_QUERY_SIZE = 500;
const ORDERING_PROGRESS_INTERVAL = 512;
// Batch and progress counts span a whole build step; k-means iteration counts restart per cluster.
const SEARCH_INDEX_COUNT_REGEX = /(?:batch|progress)\D*?(\d+)\s*\/\s*(\d+)/i;

const VISUAL_DECODE_CONCURRENCY = Math.max(
  1,
  Math.min(
    CONSTANTS.FILE.IO_CONCURRENCY,
    Number(process.env.UV_THREADPOOL_SIZE) || CONSTANTS.VECTOR.DEFAULT_THREAD_POOL_SIZE,
  ),
);

const VISUAL_INPUT_SIZE = 224;

const VISUAL_LEGACY_TABLE_NAMES = [
  "file_visual_dinov2_small_v2",
  "file_visual_dinov2_small_v1",
  "file_visual_dinov2_base_v1",
  "file_visual_clip_v4",
  "file_visual_clip_v3",
  "file_visual_clip_v2",
  "file_visual_clip_v1",
];

const VISUAL_MODEL_ID = "Xenova/dinov2-small";
const VISUAL_PREPROCESSOR_ID = "sharp-224-cover-cubic-direct";

const VISUAL_REQUIRED_FIELDS = [
  "entityId",
  "fileId",
  "indexedAt",
  "modelId",
  "sourceHash",
  "vector",
  "vectorVersion",
] as const;

const VISUAL_TABLE_NAME = "file_visual_dinov2_small_v3";
const VISUAL_VECTOR_DIMENSIONS = 384;
const VISUAL_VECTOR_TYPE: SimilarityVectorType = "visual";
const VISUAL_VECTOR_VERSION = `dinov2-small:${VISUAL_PREPROCESSOR_ID}:float16:v1`;
const VISUAL_WRITE_FLUSH_ROW_COUNT = 512;

const VISUAL_TABLE_DEF: VectorTableManifestEntry = {
  dimensions: VISUAL_VECTOR_DIMENSIONS,
  distanceType: "cosine",
  indexType: "ivf_pq",
  modelId: VISUAL_MODEL_ID,
  scope: "file",
  sourceKind: "fileHash",
  status: "active",
  tableName: VISUAL_TABLE_NAME,
  vectorDType: "float16",
  vectorType: VISUAL_VECTOR_TYPE,
  vectorVersion: VISUAL_VECTOR_VERSION,
};

const FUTURE_TABLE_POLICIES: Record<
  Exclude<SimilarityVectorType, "visual">,
  Pick<VectorTableManifestEntry, "scope" | "sourceKind">
> = {
  audio: { scope: "segment", sourceKind: "audioSegmentHash" },
  description: { scope: "file", sourceKind: "descriptionHash" },
  face: { scope: "region", sourceKind: "faceRegionHash" },
  params: { scope: "file", sourceKind: "paramsHash" },
  tags: { scope: "file", sourceKind: "tagsHash" },
  transcript: { scope: "segment", sourceKind: "transcriptHash" },
};

const makeDefaultManifest = (): VectorManifest => ({
  activeTables: { [VISUAL_VECTOR_TYPE]: VISUAL_TABLE_NAME },
  tables: { [VISUAL_TABLE_NAME]: VISUAL_TABLE_DEF },
  version: 2,
});

const makeEmptyTimings = (): SimilarityBackfillTimings => ({
  decodeMs: 0,
  existingRowsMs: 0,
  indexMs: 0,
  inferenceMs: 0,
  mongoMs: 0,
  sourcePrepMs: 0,
  totalMs: 0,
  vectorPostMs: 0,
  writeMs: 0,
});

const makeEmptyDecodeDiagnostics = (): SimilarityDecodeDiagnostics => ({
  estimatedPixelCount: 0,
  imageCount: 0,
  imageMs: 0,
  videoCount: 0,
  videoMs: 0,
});

const escapeSqlString = (str: string) => str.replace(/'/g, "''");

const makeFileIdPredicate = (fileId: string) => `fileId = '${escapeSqlString(fileId)}'`;

const makeFileIdsPredicate = (fileIds: string[]) =>
  `fileId IN (${fileIds.map((fileId) => `'${escapeSqlString(fileId)}'`).join(", ")})`;

const getIsFreshVectorRow = (row: any, sourceHash: string) => row?.sourceHash === sourceHash;

const getIsTerminalStatus = (status: SimilarityBackfillStatus) =>
  ["cancelled", "complete", "error"].includes(status);

const normalizeVector = (values: number[]) => {
  const norm = Math.sqrt(values.reduce((acc, val) => acc + val * val, 0));

  if (!norm) throw new Error("Cannot normalize an empty vector");

  return values.map((val) => val / norm);
};

const getCosineSimilarity = (a: Float32Array, b: Float32Array) => {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return normA && normB ? dot / Math.sqrt(normA * normB) : 0;
};

/** Similarity percentage at the displayed precision, so 100% means identical stored vectors. */
const getSimilarityScore = (similarity: number) =>
  round(Math.max(0, Math.min(100, similarity * 100)), 1);

export class VectorSimilarityService {
  private db: LanceConnection;
  private initialization: Promise<void>;
  private jobs = new Map<string, SimilarityBackfillJob>();
  private lancedb: LanceModule;
  private manifest: VectorManifest;
  private queueRevision = 0;
  private searchIndexBuild: SimilaritySearchIndexBuild;
  private tables = new Map<string, LanceTable>();

  cancelAllJobs() {
    for (const job of this.jobs.values()) {
      job.cancelRequested = true;
      job.abortController.abort();
    }
  }

  async init() {
    checkServerShutdown();

    await (this.initialization ??= this.initializeStorage().catch((error) => {
      this.initialization = null;

      throw error;
    }));

    checkServerShutdown();
  }

  private async initializeStorage() {
    for (const table of this.tables.values()) table.close();

    this.tables.clear();
    checkServerShutdown();

    const config = getConfig();

    await fs.mkdir(config.db.vector.path, { recursive: true });
    await fs.mkdir(config.file.similarity.modelCachePath, { recursive: true });

    fileLog("[VECTOR] Loading native module...");
    this.lancedb = await import("@lancedb/lancedb");
    checkServerShutdown();
    fileLog("[VECTOR] Opening vector storage...");
    this.db = await this.lancedb.connect(config.db.vector.path);
    checkServerShutdown();
    fileLog("[VECTOR] Reading manifest...");
    this.manifest = await this.loadManifest();
    checkServerShutdown();
    fileLog("[VECTOR] Opening manifest tables...");
    await this.ensureManifestActiveTables();

    fileLog(`[VECTOR] LanceDB initialized at ${config.db.vector.path}`);
  }

  /**
   * Library scans query the opt-in search index and skip rows added since it was last updated;
   * single-file lookups search every stored vector exactly, like Find Similar.
   */
  async findDuplicateCandidates(args: {
    files: { fileId: string; hash: string }[];
    minSimilarity: number;
    useSearchIndex: boolean;
  }) {
    if (!args.files.length || args.files.length > 128)
      throw new Error("Duplicate lookup accepts between 1 and 128 files.");

    await this.init();

    const tableDef = this.getActiveTableDef(VISUAL_VECTOR_TYPE);
    const table = tableDef ? await this.openValidTableIfExists(tableDef) : null;

    if (!table) throw new Error("No visual similarity vectors are stored yet.");

    if (args.useSearchIndex && !(await this.getVectorIndex(table)))
      throw new Error(
        "Searching the whole library requires the similarity search index. Build it in Settings → Repair, then search again.",
      );

    const rows = await this.queryRowsByFileIds(
      table,
      args.files.map((file) => file.fileId),
      ["fileId", "sourceHash", "vector"],
    );
    const byId = new Map(rows.map((row) => [String(row.fileId), row]));
    const sources = args.files.map((file) => {
      const row = byId.get(file.fileId);

      return {
        fileId: file.fileId,
        vector: row?.vector && row.sourceHash === file.hash ? Float32Array.from(row.vector) : null,
      };
    });
    const indexedSources = sources.filter((source) => source.vector);
    const matches = !indexedSources.length
      ? new Map<string, DuplicateMatch[]>()
      : args.useSearchIndex
        ? await this.findIndexedDuplicates(table, tableDef, indexedSources, args.minSimilarity)
        : await this.findExactDuplicates(table, tableDef, indexedSources);

    return sources.map((source) => ({
      candidates: (matches.get(source.fileId) ?? [])
        .filter((match) => match.fileId !== source.fileId && match.score >= args.minSimilarity)
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_DUPLICATE_CANDIDATES),
      fileId: source.fileId,
      indexed: !!source.vector,
    }));
  }

  /** Exact similarity of each file to its group's reference file, from stored vectors. */
  async scoreFileSimilarities(args: { groups: { fileIds: string[]; referenceId: string }[] }) {
    await this.init();

    const tableDef = this.getActiveTableDef(VISUAL_VECTOR_TYPE);
    const table = tableDef ? await this.openValidTableIfExists(tableDef) : null;
    if (!table) throw new Error("No visual similarity vectors are stored yet.");

    const fileIds = [
      ...new Set(args.groups.flatMap((group) => [group.referenceId, ...group.fileIds])),
    ];
    const rows = await this.queryRowsByFileIds(table, fileIds, ["fileId", "vector"]);
    const vectors = new Map(rows.map((row) => [String(row.fileId), Float32Array.from(row.vector)]));

    return args.groups.map((group) => {
      const reference = vectors.get(group.referenceId);

      return Object.fromEntries(
        group.fileIds.map((fileId) => {
          const vector = vectors.get(fileId);

          return [
            fileId,
            reference && vector ? getSimilarityScore(getCosineSimilarity(reference, vector)) : 0,
          ];
        }),
      );
    });
  }

  async findSimilarVectorCandidates(args: {
    fileId: string;
    limit?: number;
    offset?: number;
    vectorType?: SimilarityVectorType;
  }) {
    const limit = Math.min(
      CONSTANTS.VECTOR.MAX_SIMILAR_RESULTS,
      Math.max(1, args.limit ?? getConfig().file.similarity.defaultLimit),
    );
    const offset = args.offset ?? 0;
    const vectorType = args.vectorType ?? VISUAL_VECTOR_TYPE;

    if (!Number.isSafeInteger(limit) || !Number.isSafeInteger(offset) || offset < 0)
      throw new Error("Invalid similarity result range.");

    await this.init();

    const tableDef = this.getActiveTableDef(vectorType);

    if (!tableDef) throw new Error("No active similarity vectors were found for this file yet.");

    await this.indexFileSimilarity({ fileId: args.fileId, vectorTypes: [vectorType] });

    const candidates = await this.findCandidatesForTable({
      fileId: args.fileId,
      limit: limit + 1,
      offset,
      tableDef,
    });

    return {
      candidates: candidates.slice(0, limit).map((candidate, index) => ({
        ...candidate,
        rank: offset + index + 1,
        vectorTypeScores: { [vectorType]: candidate.score },
      })),
      hasMore: candidates.length > limit,
      nextOffset: offset + Math.min(limit, candidates.length),
    };
  }

  async indexFileSimilarity(args: {
    fileId: string;
    force?: boolean;
    vectorTypes?: SimilarityVectorType[];
  }) {
    await this.init();

    const vectorTypes = args.vectorTypes ?? [VISUAL_VECTOR_TYPE];
    const results: { status: string; vectorType: SimilarityVectorType }[] = [];

    for (const vectorType of vectorTypes) {
      if (vectorType !== VISUAL_VECTOR_TYPE) {
        results.push({ status: "unsupported", vectorType });
        continue;
      }

      const status = await this.indexVisualFile(args.fileId, !!args.force);

      results.push({ status, vectorType });
    }

    return results;
  }

  async startSimilarityBackfill(args: SimilarityBackfillArgs = {}) {
    const revision = this.queueRevision;

    await this.init();

    if (revision !== this.queueRevision) throw new Error("Similarity backfill paused.");

    for (const job of this.jobs.values()) {
      if (job.pauseRequested) await job.execution;
    }

    const activeJob = [...this.jobs.values()].find(
      (job) => !getIsTerminalStatus(job.progress.status),
    );

    if (activeJob)
      throw new Error(
        "A similarity indexing job is already running. Wait for it to finish or cancel it first.",
      );

    if (this.searchIndexBuild?.status === "running")
      throw new Error("Wait for the similarity search index build to finish before indexing.");

    const vectorTypes = args.vectorTypes?.length ? args.vectorTypes : [VISUAL_VECTOR_TYPE];
    const jobId = randomUUID();
    const now = Date.now();

    const job: SimilarityBackfillJob = {
      abortController: new AbortController(),
      cancelRequested: false,
      pauseRequested: false,
      progress: {
        averageRate: 0,
        currentRate: 0,
        decodeDiagnostics: makeEmptyDecodeDiagnostics(),
        errorCount: 0,
        index: 0,
        indexedCount: 0,
        jobId,
        migratedCount: 0,
        missingFileCount: 0,
        missingThumbCount: 0,
        orderingIndex: 0,
        orderingTotal: 0,
        skippedFreshCount: 0,
        stage: "idle",
        startedAt: now,
        status: "queued",
        timings: makeEmptyTimings(),
        total: args.fileIds?.length ?? 0,
        unsupportedFileTypeCount: 0,
        updatedAt: now,
        vectorTypes,
      },
    };

    if (isServerStopping()) throw new Error("Vector service is shutting down");

    let persisted: {
      _id: string;
      args: SimilarityBackfillArgs;
      progress: SimilarityBackfillProgress;
    };

    try {
      persisted = await SimilarityBackfillModel.findOneAndUpdate(
        { queueKey: "visual" },
        {
          $setOnInsert: {
            _id: jobId,
            args: { ...args, vectorTypes },
            offset: 0,
            progress: job.progress,
          },
        },
        { new: true, upsert: true },
      ).lean();
    } catch (error) {
      if (error.code !== 11000) throw error;

      persisted = await SimilarityBackfillModel.findOne({ queueKey: "visual" }).lean();
    }

    if (!persisted) throw new Error("Similarity backfill claim is unavailable.");

    if (revision !== this.queueRevision) return persisted.progress;

    if (this.jobs.has(persisted._id)) return this.jobs.get(persisted._id).progress;

    job.progress = persisted.progress;
    this.jobs.set(persisted._id, job);

    job.execution = this.runSimilarityBackfill(job, persisted.args).catch((error) =>
      fileLog(`[VECTOR] Backfill checkpoint failed: ${error.message}`, { type: "error" }),
    );

    return job.progress;
  }

  async getSimilarityBackfillProgress(args: { jobId: string }) {
    const job = this.jobs.get(args.jobId);

    if (job) return job.progress;

    const persisted = await SimilarityBackfillModel.findById(args.jobId).lean();

    if (!persisted) throw new Error(`Similarity backfill job not found: ${args.jobId}`);

    return persisted.progress;
  }

  async pauseSimilarityBackfills() {
    this.queueRevision++;

    for (const job of this.jobs.values()) {
      job.pauseRequested = true;
      job.abortController.abort();
      this.updateJobProgress(job, {
        message: "Similarity indexing paused. Run it again in Settings → Repair to continue.",
        status: "queued",
      });
    }

    if (await isPersistenceReady())
      await SimilarityBackfillModel.updateMany(
        { queueKey: "visual" },
        {
          $set: {
            "progress.message":
              "Similarity indexing paused. Run it again in Settings → Repair to continue.",
            "progress.status": "queued",
          },
        },
      );
  }

  async cancelSimilarityBackfill(args: { jobId: string }) {
    const job = this.jobs.get(args.jobId);

    if (job && getIsTerminalStatus(job.progress.status)) return job.progress;

    if (job) {
      job.cancelRequested = true;
      job.abortController.abort();

      this.updateJobProgress(job, {
        completedAt: Date.now(),
        message: "Similarity backfill cancelled.",
        stage: "cancelled",
        status: "cancelled",
      });
    }

    const persisted = await SimilarityBackfillModel.findOneAndUpdate(
      { _id: args.jobId, "progress.status": { $in: ["queued", "running"] } },
      {
        $set: {
          "progress.completedAt": Date.now(),
          "progress.message": "Similarity backfill cancelled.",
          "progress.stage": "cancelled",
          "progress.status": "cancelled",
        },
        $unset: { queueKey: 1 },
      },
      { new: true },
    ).lean();
    const progress =
      persisted?.progress ?? (await SimilarityBackfillModel.findById(args.jobId).lean())?.progress;

    if (!progress) throw new Error(`Similarity backfill job not found: ${args.jobId}`);

    return progress;
  }

  async listFilesNeedingSimilarityIndex(args: {
    afterFileId?: string;
    force?: boolean;
    includeTotal?: boolean;
    limit?: number;
    scanLimit?: number;
    vectorTypes?: SimilarityVectorType[];
  }) {
    await this.init();

    const limit = args.limit ?? 25;
    const scanLimit = args.scanLimit ?? Math.max(limit * 10, limit);
    const vectorTypes = args.vectorTypes ?? [VISUAL_VECTOR_TYPE];
    const fileQuery = args.afterFileId ? { _id: { $gt: args.afterFileId } } : {};

    const files = await models.FileModel.find(fileQuery)
      .sort({ _id: 1 })
      .limit(scanLimit)
      .select({ _id: 1, ext: 1, hash: 1, thumb: 1 })
      .lean();

    const fileIds = files.map((file) => file._id.toString());

    const rowMaps = await this.getCurrentVectorRowsByFileId({
      fileIds,
      vectorTypes,
    });

    const staleFileIds: string[] = [];
    let lastScannedFileId: string | undefined;
    let scannedCount = 0;

    for (const file of files) {
      const fileId = file._id.toString();

      lastScannedFileId = fileId;
      scannedCount++;

      const isFresh = vectorTypes.every((vectorType) => {
        const row = rowMaps[vectorType]?.get(fileId);

        return !args.force && getIsFreshVectorRow(row, file.hash);
      });

      if (!isFresh) staleFileIds.push(fileId);

      if (staleFileIds.length >= limit) break;
    }

    return {
      fileIds: staleFileIds,
      hasMore: staleFileIds.length >= limit || files.length === scanLimit,
      nextCursor: lastScannedFileId,
      scannedCount,
      totalCount: args.includeTotal ? await models.FileModel.estimatedDocumentCount() : undefined,
    };
  }

  async optimizeSimilarityTables(args: { vectorTypes?: SimilarityVectorType[] } = {}) {
    await this.init();

    const vectorTypes = args.vectorTypes ?? [VISUAL_VECTOR_TYPE];
    const optimizedTables: string[] = [];

    for (const vectorType of vectorTypes) {
      const tableDef = this.getActiveTableDef(vectorType);
      const table = tableDef ? await this.openValidTableIfExists(tableDef) : null;

      if (!table || !tableDef) continue;

      await table.optimize({ cleanupOlderThan: new Date(), deleteUnverified: false });
      optimizedTables.push(tableDef.tableName);
    }

    return { optimizedTables };
  }

  async getSearchIndexStatus() {
    await this.init();

    const tableDef = this.getActiveTableDef(VISUAL_VECTOR_TYPE);
    const table = tableDef ? await this.openValidTableIfExists(tableDef) : null;
    const index = table ? await this.getVectorIndex(table) : null;
    const stats = index ? await table.indexStats(index.name) : null;

    return {
      error: this.searchIndexBuild?.error ?? "",
      hasIndex: !!index,
      indexedRowCount: stats?.numIndexedRows ?? 0,
      isUpdate: this.searchIndexBuild?.isUpdate ?? false,
      message: this.searchIndexBuild?.message ?? "",
      percent: this.searchIndexBuild?.percent ?? null,
      startedAt: this.searchIndexBuild?.startedAt ?? null,
      status: this.searchIndexBuild?.status ?? (index ? "complete" : "idle"),
      unindexedRowCount: stats?.numUnindexedRows ?? 0,
    };
  }

  /**
   * Builds the opt-in index used by library-wide duplicate scans, or appends rows vectorized since
   * the last run without retraining. Only Repair starts it; vectors themselves are never changed.
   */
  async startSearchIndexBuild() {
    await this.init();

    if (this.searchIndexBuild?.status === "running") return this.getSearchIndexStatus();

    // Claim the build before awaiting so overlapping starts cannot train two indexes.
    const build: SimilaritySearchIndexBuild = {
      controller: new AbortController(),
      error: "",
      isUpdate: false,
      message: "",
      percent: null,
      startedAt: Date.now(),
      status: "running",
    };

    this.searchIndexBuild = build;

    let target: Awaited<ReturnType<VectorSimilarityService["getSearchIndexTarget"]>>;

    try {
      target = await this.getSearchIndexTarget();
    } catch (error) {
      build.error = error.message;
      build.status = "error";

      throw error;
    }

    build.isUpdate = target.isUpdate;
    fileLog(
      `[VECTOR] ${target.isUpdate ? "Updating" : "Building"} the similarity search index over ${target.rowCount.toLocaleString()} vectors.`,
    );

    // The worker only logs Lance's index builders below warn, as "[timestamp LEVEL target] message".
    const handleOutput = (line: string) => {
      const [, target, message] = line.match(/^\[\S+\s+(?:DEBUG|INFO)\s+(\S+)\]\s*(.*)$/) ?? [];

      if (/^lance(::dataset::optimize|::index|_index)/.test(target ?? "")) {
        const [, done, total] = message.match(SEARCH_INDEX_COUNT_REGEX) ?? [];

        build.message = message;
        build.percent = +total ? Math.min(100, (+done / +total) * 100) : null;
      }
    };

    (async () => {
      try {
        // A separate process makes the build cancellable; Lance commits the index atomically, so a
        // cancelled build leaves no partial index behind.
        await runNativeTask(
          "search-index",
          {
            config: target.config,
            dbPath: getConfig().db.vector.path,
            distanceType: target.tableDef.distanceType,
            isUpdate: target.isUpdate,
            tableName: target.tableDef.tableName,
          },
          build.controller.signal,
          undefined,
          handleOutput,
        );

        await target.table.checkoutLatest();

        if (!(await this.getVectorIndex(target.table)))
          throw new Error("LanceDB did not report the search index after building it.");

        build.status = "complete";
        fileLog(
          `[VECTOR] Similarity search index ready in ${Math.round((Date.now() - build.startedAt) / 1000)}s.`,
        );
      } catch (error) {
        if (build.controller.signal.aborted) {
          build.status = "cancelled";
          fileLog("[VECTOR] Similarity search index build cancelled.");
        } else {
          build.error = error.message;
          build.status = "error";
          fileLog(`[VECTOR] Similarity search index failed: ${error.message}`, { type: "error" });
        }
      }
    })();

    return this.getSearchIndexStatus();
  }

  cancelSearchIndexBuild() {
    this.searchIndexBuild?.controller.abort();

    return this.getSearchIndexStatus();
  }

  private async runSimilarityBackfill(job: SimilarityBackfillJob, args: SimilarityBackfillArgs) {
    try {
      this.updateJobProgress(job, { stage: "scanning", status: "running" });

      if (args.vectorTypes?.includes(VISUAL_VECTOR_TYPE)) {
        await runBackgroundExecution(
          () => this.runVisualBackfill(job, args),
          job.abortController.signal,
          false,
        );
      }

      this.assertJobNotCancelled(job);
      await this.dropLegacyVisualTablesAfterValidatedMigration(job, args);

      this.updateJobProgress(job, {
        completedAt: Date.now(),
        message: "Similarity backfill complete.",
        stage: "complete",
        status: "complete",
      });
    } catch (err) {
      if (job.pauseRequested) return;

      const isCancelled = job.cancelRequested || err.message === "Similarity backfill cancelled";

      this.updateJobProgress(job, {
        completedAt: Date.now(),
        message: isCancelled ? "Similarity backfill cancelled." : err.message,
        stage: isCancelled ? "cancelled" : "error",
        status: isCancelled ? "cancelled" : "error",
      });

      if (!isCancelled)
        fileLog(`[VECTOR] Similarity backfill failed: ${err.message}`, { type: "error" });
    } finally {
      try {
        if (!isServerStopping() && !job.pauseRequested)
          await SimilarityBackfillModel.updateOne(
            { _id: job.progress.jobId, queueKey: "visual" },
            { $set: { progress: job.progress }, $unset: { queueKey: 1 } },
          );
      } finally {
        this.jobs.delete(job.progress.jobId);
      }
    }
  }

  private async runVisualBackfill(job: SimilarityBackfillJob, args: SimilarityBackfillArgs) {
    const total = args.fileIds?.length ?? (await models.FileModel.estimatedDocumentCount());

    this.updateJobProgress(job, {
      stage: "scanning",
      total,
    });

    const checkpoint = await SimilarityBackfillModel.findById(job.progress.jobId).lean();
    let cursor = checkpoint.cursor;
    let offset = checkpoint.offset;

    while (true) {
      this.assertJobNotCancelled(job);
      this.updateJobProgress(job, { stage: "scanning" });

      const mongoStart = Date.now();

      const files = args.fileIds?.length
        ? await models.FileModel.find({
            _id: { $in: args.fileIds.slice(offset, offset + DEFAULT_SCAN_WINDOW_SIZE) },
          })
            .select({ _id: 1, ext: 1, hash: 1, height: 1, thumb: 1, width: 1 })
            .lean()
        : await models.FileModel.find(cursor ? { _id: { $gt: cursor } } : {})
            .sort({ _id: 1 })
            .limit(DEFAULT_SCAN_WINDOW_SIZE)
            .select({ _id: 1, ext: 1, hash: 1, height: 1, thumb: 1, width: 1 })
            .lean();

      this.addTiming(job, "mongoMs", Date.now() - mongoStart);

      if (!files.length && !args.fileIds?.length) break;

      if (args.fileIds?.length) {
        const missingFileCount =
          Math.min(DEFAULT_SCAN_WINDOW_SIZE, args.fileIds.length - offset) - files.length;

        if (missingFileCount)
          this.addProcessedRows(job, { missingFileCount, processedCount: missingFileCount });
      }

      cursor = files[files.length - 1]?._id.toString() ?? cursor;
      offset += DEFAULT_SCAN_WINDOW_SIZE;

      const batchResult = this.makeEmptyBatchResult(files.length);

      if (files.length)
        await this.indexVisualFileDocs({
          files,
          force: !!args.force,
          job,
          result: batchResult,
          vectorTypes: args.vectorTypes ?? [VISUAL_VECTOR_TYPE],
        });

      this.assertJobNotCancelled(job);

      await SimilarityBackfillModel.updateOne(
        { _id: job.progress.jobId, queueKey: "visual" },
        { $set: { cursor, offset, progress: job.progress } },
      );

      if (args.fileIds?.length && offset >= args.fileIds.length) break;
    }
  }

  private async indexVisualFileDocs(args: {
    files: any[];
    force: boolean;
    job?: SimilarityBackfillJob;
    result: SimilarityIndexBatchResult;
    vectorTypes: SimilarityVectorType[];
  }) {
    if (!args.vectorTypes.includes(VISUAL_VECTOR_TYPE)) {
      args.result.unsupportedFileTypeCount += args.files.length;

      if (args.job)
        this.addProcessedRows(args.job, {
          processedCount: args.files.length,
          unsupportedFileTypeCount: args.files.length,
        });

      return;
    }

    const tableDef = this.getActiveTableDef(VISUAL_VECTOR_TYPE);

    if (!tableDef) throw new Error("No active visual vector table is configured.");

    const fileIds = args.files.map((file) => file._id.toString());
    const existingStart = Date.now();

    if (args.job) this.updateJobProgress(args.job, { stage: "scanning" });

    const existingRows =
      (
        await this.getCurrentVectorRowsByFileId({
          fileIds,
          vectorTypes: [VISUAL_VECTOR_TYPE],
        })
      )[VISUAL_VECTOR_TYPE] ?? new Map<string, any>();

    args.result.timings.existingRowsMs += Date.now() - existingStart;

    if (args.job) this.addTiming(args.job, "existingRowsMs", Date.now() - existingStart);

    const sourcePrepStart = Date.now();
    const sourceItems: VisualSourceItem[] = [];
    let sourcePrepProcessedCount = 0;
    let sourcePrepErrorCount = 0;
    let sourcePrepMissingFileCount = 0;
    let sourcePrepMissingThumbCount = 0;
    let sourcePrepSkippedFreshCount = 0;
    let sourcePrepUnsupportedFileTypeCount = 0;

    for (const file of args.files) {
      if (!file) {
        args.result.missingFileCount++;
        sourcePrepMissingFileCount++;
        sourcePrepProcessedCount++;
        continue;
      }

      const fileId = file._id.toString();

      if (!file.thumb?.path) {
        args.result.missingThumbCount++;
        sourcePrepMissingThumbCount++;
        sourcePrepProcessedCount++;
        continue;
      }

      if (!this.getIsVisualFile(file.ext)) {
        args.result.unsupportedFileTypeCount++;
        sourcePrepUnsupportedFileTypeCount++;
        sourcePrepProcessedCount++;
        continue;
      }

      try {
        const existing = existingRows.get(fileId);

        if (!args.force && getIsFreshVectorRow(existing, file.hash)) {
          args.result.skippedFreshCount++;
          sourcePrepSkippedFreshCount++;
          sourcePrepProcessedCount++;
          continue;
        }

        sourceItems.push(this.makeVisualSource(file));
      } catch (err) {
        args.result.errorCount++;
        sourcePrepErrorCount++;
        sourcePrepProcessedCount++;
        fileLog(`[VECTOR] Failed visual similarity source prep for ${fileId}: ${err.message}`, {
          type: "error",
        });
      }
    }

    const sourcePrepMs = Date.now() - sourcePrepStart;

    args.result.timings.sourcePrepMs += sourcePrepMs;

    if (args.job) this.addTiming(args.job, "sourcePrepMs", sourcePrepMs);

    if (args.job && sourcePrepProcessedCount)
      this.addProcessedRows(args.job, {
        errorCount: sourcePrepErrorCount,
        missingFileCount: sourcePrepMissingFileCount,
        missingThumbCount: sourcePrepMissingThumbCount,
        processedCount: sourcePrepProcessedCount,
        skippedFreshCount: sourcePrepSkippedFreshCount,
        unsupportedFileTypeCount: sourcePrepUnsupportedFileTypeCount,
      });

    const pipelineBatchSize = this.getVisualInferenceBatchSize();
    let pendingDecodeDiagnostics = makeEmptyDecodeDiagnostics();
    let pendingDecodeMs = 0;
    let pendingErrorCount = 0;
    let pendingInferenceMs = 0;
    let pendingProcessedCount = 0;
    const pendingRows: Record<string, any>[] = [];

    const flushPendingRows = async () => {
      if (!pendingProcessedCount) return;

      const rows = pendingRows.splice(0, pendingRows.length);

      const writeMs = await this.writeVectorRows({
        job: args.job,
        rows,
        tableDef,
      });

      args.result.timings.writeMs += writeMs;

      if (args.job)
        this.addCompletedRows(args.job, {
          decodeDiagnostics: pendingDecodeDiagnostics,
          decodeMs: pendingDecodeMs,
          errorCount: pendingErrorCount,
          generatedCount: rows.length,
          inferenceMs: pendingInferenceMs,
          migratedCount: 0,
          processedCount: pendingProcessedCount,
          writeMs,
        });

      args.result.indexedCount += rows.length;

      pendingDecodeDiagnostics = makeEmptyDecodeDiagnostics();
      pendingDecodeMs = 0;
      pendingErrorCount = 0;
      pendingInferenceMs = 0;
      pendingProcessedCount = 0;
    };

    const storageOrderStart = Date.now();
    const orderedSourceItems = await this.sortVisualSourcesByNtfsFileId(sourceItems, args.job);
    const storageOrderMs = Date.now() - storageOrderStart;

    args.result.timings.sourcePrepMs += storageOrderMs;

    if (args.job) this.addTiming(args.job, "sourcePrepMs", storageOrderMs);

    const sourceBatches = chunkArray(
      orderedSourceItems,
      Math.max(pipelineBatchSize, VISUAL_DECODE_CONCURRENCY),
    );

    let decodedBatchPromise = sourceBatches.length
      ? this.decodeVisualSourceBatch({
          job: args.job,
          result: args.result,
          sourceItems: sourceBatches[0],
        })
      : null;

    for (let batchIndex = 0; batchIndex < sourceBatches.length; batchIndex++) {
      args.job && this.assertJobNotCancelled(args.job);

      if (!decodedBatchPromise) break;

      const sourceBatch = sourceBatches[batchIndex];
      const { decodeMs, decoded, diagnostics } = await decodedBatchPromise;

      decodedBatchPromise = sourceBatches[batchIndex + 1]
        ? this.decodeVisualSourceBatch({
            job: args.job,
            result: args.result,
            sourceItems: sourceBatches[batchIndex + 1],
          })
        : null;

      const batchRows: Record<string, any>[] = [];
      let inferenceMs = 0;

      for (const inferenceBatch of chunkArray(decoded, pipelineBatchSize)) {
        const embedded = await this.embedVisualDecodedSources({
          decoded: inferenceBatch,
          job: args.job,
          result: args.result,
          tableDef,
        });

        batchRows.push(...embedded.rows);
        inferenceMs += embedded.inferenceMs;
      }

      const failedCount = sourceBatch.length - batchRows.length;

      args.result.errorCount += failedCount;
      pendingDecodeDiagnostics = this.sumDecodeDiagnostics(pendingDecodeDiagnostics, diagnostics);
      pendingDecodeMs += decodeMs;
      pendingErrorCount += failedCount;
      pendingInferenceMs += inferenceMs;
      pendingProcessedCount += sourceBatch.length;
      pendingRows.push(...batchRows);

      if (pendingProcessedCount >= VISUAL_WRITE_FLUSH_ROW_COUNT) await flushPendingRows();
    }

    await flushPendingRows();
  }

  private async decodeVisualSourceBatch(args: {
    job?: SimilarityBackfillJob;
    result: SimilarityIndexBatchResult;
    sourceItems: VisualSourceItem[];
  }) {
    const decodeStart = Date.now();

    if (args.job) this.updateJobProgress(args.job, { stage: "decoding" });

    const { decoded, diagnostics } = await this.decodeVisualSourcesInline(
      args.sourceItems,
      args.job,
    );
    const decodeMs = Date.now() - decodeStart;

    args.result.timings.decodeMs += decodeMs;

    return { decodeMs, decoded, diagnostics };
  }

  private async embedVisualDecodedSources(args: {
    decoded: VisualDecodedItem[];
    job?: SimilarityBackfillJob;
    result: SimilarityIndexBatchResult;
    tableDef: VectorTableManifestEntry;
  }) {
    if (!args.decoded.length) return { inferenceMs: 0, rows: [] };

    const rows: Record<string, any>[] = [];

    const inferenceStart = Date.now();

    if (args.job) {
      this.assertJobNotCancelled(args.job);
      this.updateJobProgress(args.job, { stage: "inferencing" });
    }

    const vectors = await this.inferVisualDecodedItemsInline(args.decoded);
    const inferenceMs = Date.now() - inferenceStart;

    args.result.timings.inferenceMs += inferenceMs;

    for (const vectorItem of vectors) {
      rows.push(
        this.makeVectorRow({
          fileId: vectorItem.fileId,
          sourceHash: vectorItem.sourceHash,
          tableDef: args.tableDef,
          vector: vectorItem.vector,
        }),
      );
    }

    return { inferenceMs, rows };
  }

  private async embedVisualSource(sourcePath: string, fileId: string, sourceHash: string) {
    const { decoded } = await this.decodeVisualSourcesInline([
      {
        entityId: fileId,
        estimatedPixelCount: 0,
        fileId,
        kind: "image",
        sourceHash,
        sourcePath,
      },
    ]);

    const vectors = await this.inferVisualDecodedItemsInline(decoded);

    return vectors[0]?.vector;
  }

  private async sortVisualSourcesByNtfsFileId(
    sourceItems: VisualSourceItem[],
    job?: SimilarityBackfillJob,
  ) {
    if (sourceItems.length < 2) return sourceItems;

    const metadataUpdates: ThumbnailNtfsMetadata[] = [];
    const orderedItems: VisualSourceOrderItem[] = [];
    let orderedCount = 0;

    if (job)
      this.updateJobProgress(job, {
        orderingIndex: 0,
        orderingTotal: sourceItems.length,
        stage: "ordering",
      });

    await runConcurrent(sourceItems, VISUAL_DECODE_CONCURRENCY, async (sourceItem) => {
      job && this.assertJobNotCancelled(job);

      let ntfsFileId = this.parseNtfsId(sourceItem.ntfsFileId);
      let ntfsVolumeId = this.parseNtfsId(sourceItem.ntfsVolumeId);

      if (ntfsFileId === undefined || ntfsVolumeId === undefined) {
        try {
          const identity = await getNtfsFileIdentity(sourceItem.sourcePath);

          ntfsFileId = BigInt(identity.fileId);
          ntfsVolumeId = BigInt(identity.volumeId);

          metadataUpdates.push({
            fileId: sourceItem.fileId,
            ntfsFileId: identity.fileId,
            ntfsVolumeId: identity.volumeId,
            sourcePath: sourceItem.sourcePath,
          });
        } catch {
          // The read pass reports missing or inaccessible sources with the file identifier.
        }
      }

      orderedItems.push({
        ntfsFileId,
        ntfsVolumeId,
        sourceItem,
        volumeRoot: path.parse(sourceItem.sourcePath).root,
      });

      orderedCount++;

      if (
        job &&
        (orderedCount % ORDERING_PROGRESS_INTERVAL === 0 || orderedCount === sourceItems.length)
      )
        this.updateJobProgress(job, { orderingIndex: orderedCount });
    });

    for (const metadataItems of chunkArray(metadataUpdates, CONSTANTS.FILE.THUMB.NTFS_BATCH_SIZE)) {
      job && this.assertJobNotCancelled(job);

      await storeThumbnailNtfsMetadata(metadataItems);
    }

    orderedItems.sort((left, right) => {
      const volumeComparison = left.volumeRoot.localeCompare(right.volumeRoot);

      if (volumeComparison) return volumeComparison;

      if (left.ntfsVolumeId === undefined || right.ntfsVolumeId === undefined) {
        if (left.ntfsVolumeId === undefined && right.ntfsVolumeId !== undefined) return 1;

        if (left.ntfsVolumeId !== undefined && right.ntfsVolumeId === undefined) return -1;
      } else {
        if (left.ntfsVolumeId < right.ntfsVolumeId) return -1;

        if (left.ntfsVolumeId > right.ntfsVolumeId) return 1;
      }

      if (left.ntfsFileId === undefined)
        return right.ntfsFileId === undefined
          ? left.sourceItem.sourcePath.localeCompare(right.sourceItem.sourcePath)
          : 1;

      if (right.ntfsFileId === undefined) return -1;

      if (left.ntfsFileId < right.ntfsFileId) return -1;

      if (left.ntfsFileId > right.ntfsFileId) return 1;

      return left.sourceItem.sourcePath.localeCompare(right.sourceItem.sourcePath);
    });

    return orderedItems.map(({ sourceItem }) => sourceItem);
  }

  private parseNtfsId(value?: string) {
    if (!value) return;

    try {
      return BigInt(value);
    } catch {
      return;
    }
  }

  private async decodeVisualSourcesInline(
    sourceItems: VisualSourceItem[],
    job?: SimilarityBackfillJob,
  ) {
    const decoded: VisualDecodedItem[] = [];
    const diagnostics = makeEmptyDecodeDiagnostics();

    const reportSourceError = (
      stage: "decode" | "read",
      item: VisualSourceItem,
      error: unknown,
    ) => {
      const message = `Failed visual similarity ${stage} for ${item.fileId} (${item.sourcePath}): ${(error as Error)?.message ?? String(error)}`;

      if (!job || (job.reportedErrorCount ?? 0) < 5) {
        fileLog(`[VECTOR] ${message}`, { type: "error" });

        if (job) {
          job.reportedErrorCount = (job.reportedErrorCount ?? 0) + 1;
          this.updateJobProgress(job, {
            message:
              job.reportedErrorCount === 5
                ? `${message} Further per-file errors are counted in progress; individual messages are suppressed.`
                : message,
          });
        }
      }
    };

    const decodeBuffer = async (item: VisualSourceItem, sourceData: Buffer, readMs: number) => {
      const itemStart = Date.now();

      try {
        const {
          decoded: { data, info },
        } = await runImageTask({
          concurrency: Math.max(1, Math.floor(availableParallelism() / VISUAL_DECODE_CONCURRENCY)),
          input: sourceData,
          options: { failOn: "none", limitInputPixels: false },
          visualSize: VISUAL_INPUT_SIZE,
        });

        if (info.channels !== 3)
          throw new Error(`Unexpected visual source channel count: ${info.channels}. Expected 3.`);

        decoded.push({
          ...item,
          channels: 3,
          data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength),
          height: info.height,
          width: info.width,
        });
      } catch (err) {
        workSignal.getStore()?.throwIfAborted();

        reportSourceError("decode", item, err);
      } finally {
        diagnostics.estimatedPixelCount += item.estimatedPixelCount;
        diagnostics[`${item.kind}Count`]++;
        diagnostics[`${item.kind}Ms`] += readMs + Date.now() - itemStart;
      }
    };

    const activeDecodes = new Set<Promise<void>>();

    for (const item of sourceItems) {
      workSignal.getStore()?.throwIfAborted();

      if (activeDecodes.size >= VISUAL_DECODE_CONCURRENCY) await Promise.race(activeDecodes);

      const readStart = Date.now();
      let data: Buffer;

      try {
        data = await fs.readFile(item.sourcePath, { signal: workSignal.getStore() });
      } catch (error) {
        workSignal.getStore()?.throwIfAborted();
        diagnostics.estimatedPixelCount += item.estimatedPixelCount;
        diagnostics[`${item.kind}Count`]++;
        diagnostics[`${item.kind}Ms`] += Date.now() - readStart;

        reportSourceError("read", item, error);

        continue;
      }

      const decoding = decodeBuffer(item, data, Date.now() - readStart).finally(() =>
        activeDecodes.delete(decoding),
      );

      activeDecodes.add(decoding);
      decoding.catch(() => {});
    }

    await Promise.all(activeDecodes);

    return { decoded, diagnostics };
  }

  private async inferVisualDecodedItemsInline(items: VisualDecodedItem[]) {
    if (!items.length) return [];

    const tensor = await runNativeTask<{ data: number[]; dims: number[] }>("visual", {
      config: getConfig().file.similarity,
      dtype: this.getVisualInferenceDType(),
      images: items.map(({ data, height, width }) => ({ data, height, width })),
      modelId: VISUAL_MODEL_ID,
    });

    const vectors = this.extractVisualFeatureVectors(tensor, items.length);

    return items.map((item, idx) => ({
      ...item,
      vector: normalizeVector(vectors[idx]),
    }));
  }

  private extractVisualFeatureVectors(tensor: any, batchSize: number) {
    const values = Array.from(tensor.data, Number);
    const dims = tensor.dims as number[] | undefined;
    const expectedLength = batchSize * VISUAL_VECTOR_DIMENSIONS;

    if (dims?.length === 2 && dims[0] === batchSize && dims[1] === VISUAL_VECTOR_DIMENSIONS) {
      return Array.from({ length: batchSize }, (_, idx) =>
        values.slice(idx * VISUAL_VECTOR_DIMENSIONS, (idx + 1) * VISUAL_VECTOR_DIMENSIONS),
      );
    } else if (
      dims?.length === 3 &&
      dims[0] === batchSize &&
      dims[2] === VISUAL_VECTOR_DIMENSIONS
    ) {
      const tokenCount = dims[1];

      return Array.from({ length: batchSize }, (_, idx) => {
        const offset = idx * tokenCount * VISUAL_VECTOR_DIMENSIONS;

        return values.slice(offset, offset + VISUAL_VECTOR_DIMENSIONS);
      });
    } else if (values.length === expectedLength) {
      return Array.from({ length: batchSize }, (_, idx) =>
        values.slice(idx * VISUAL_VECTOR_DIMENSIONS, (idx + 1) * VISUAL_VECTOR_DIMENSIONS),
      );
    } else {
      throw new Error(
        `Unexpected visual vector shape: ${dims?.join("x") ?? values.length}. Expected ${batchSize}x${VISUAL_VECTOR_DIMENSIONS} or ${batchSize}xNx${VISUAL_VECTOR_DIMENSIONS}.`,
      );
    }
  }

  private getVisualInferenceBatchSize() {
    const configured = getConfig().file.similarity.visual.inferenceBatchSize;

    return Math.max(1, configured);
  }

  private getVisualInferenceDType() {
    const config = getConfig().file.similarity.visual;

    if (config.device === "dml" && config.inferenceDType === "fp16") return "fp32";
    else return config.inferenceDType;
  }

  private async findCandidatesForTable(args: {
    fileId: string;
    limit: number;
    offset: number;
    tableDef: VectorTableManifestEntry;
  }) {
    const table = await this.openValidTableIfExists(args.tableDef);

    if (!table) throw new Error("No active visual vector was found for this file yet.");

    const sourceRows = await table
      .query()
      .select(["entityId", "fileId", "vector"])
      .where(makeFileIdPredicate(args.fileId))
      .limit(1)
      .toArray();

    const sourceRow = sourceRows[0];

    if (!sourceRow?.vector) throw new Error("No active visual vector was found for this file yet.");

    // Find Similar stays exact; the search index only serves library-wide duplicate scans.
    return (
      await table
        .vectorSearch(Array.from(sourceRow.vector, Number))
        .column("vector")
        .distanceType(args.tableDef.distanceType)
        .bypassVectorIndex()
        .select(["fileId"])
        .where(`NOT (${makeFileIdPredicate(args.fileId)})`)
        .offset(args.offset)
        .limit(args.limit)
        .toArray()
    ).map((row) => {
      const distance = Number(row._distance ?? 1);

      return {
        distance,
        fileId: String(row.fileId),
        score: Math.max(0, Math.min(1, 1 - distance)),
      };
    });
  }

  private async getSearchIndexTarget() {
    // Compaction during an update would conflict with backfill writes to the same rows.
    if ([...this.jobs.values()].some((job) => !getIsTerminalStatus(job.progress.status)))
      throw new Error("Wait for similarity indexing to finish before building the search index.");

    const tableDef = this.getActiveTableDef(VISUAL_VECTOR_TYPE);
    const table = tableDef ? await this.openValidTableIfExists(tableDef) : null;
    const rowCount = table ? await table.countRows() : 0;
    const config = getConfig().file.similarity.index.ivfPq;

    if (rowCount < 2 ** config.numBits)
      throw new Error(
        `At least ${2 ** config.numBits} similarity vectors are needed to build the search index.`,
      );

    return { config, isUpdate: !!(await this.getVectorIndex(table)), rowCount, table, tableDef };
  }

  /** Searches every stored vector exactly; single-file lookups need complete results. */
  private async findExactDuplicates(
    table: LanceTable,
    tableDef: VectorTableManifestEntry,
    sources: DuplicateSource[],
  ) {
    const matches = new Map<string, DuplicateMatch[]>();

    for (const source of sources) {
      const rows = await table
        .vectorSearch(source.vector)
        .column("vector")
        .distanceType(tableDef.distanceType)
        .bypassVectorIndex()
        .select(["fileId", "sourceHash"])
        .limit(MAX_DUPLICATE_CANDIDATES + 1)
        .toArray();

      matches.set(
        source.fileId,
        rows.map((row) => ({
          fileId: String(row.fileId),
          hash: String(row.sourceHash),
          score: getSimilarityScore(1 - Number(row._distance)),
        })),
      );
    }

    return matches;
  }

  /**
   * Searches a batch in one multi-vector query on the search index so LanceDB spreads it across
   * its threads. Index distances are quantized, so instead of refining every neighbour from disk,
   * only those near the threshold are re-scored exactly against their stored vectors.
   */
  private async findIndexedDuplicates(
    table: LanceTable,
    tableDef: VectorTableManifestEntry,
    sources: DuplicateSource[],
    minSimilarity: number,
  ) {
    const config = getConfig().file.similarity.index.ivfPq;
    const rows = await table
      .vectorSearch(sources.map((source) => source.vector))
      .column("vector")
      .distanceType(tableDef.distanceType)
      .fastSearch()
      .nprobes(config.nprobes)
      .select(["fileId"])
      .limit(MAX_DUPLICATE_CANDIDATES + 1)
      .toArray();
    const nearRows = rows.filter(
      (row) => (1 - Number(row._distance)) * 100 >= minSimilarity - DUPLICATE_QUANTIZATION_MARGIN,
    );
    const candidateRows = nearRows.length
      ? await this.queryRowsByFileIds(
          table,
          [...new Set(nearRows.map((row) => String(row.fileId)))],
          ["fileId", "sourceHash", "vector"],
        )
      : [];
    const candidates = new Map(
      candidateRows.map((row) => [
        String(row.fileId),
        { hash: String(row.sourceHash), vector: Float32Array.from(row.vector) },
      ]),
    );
    const matches = new Map<string, DuplicateMatch[]>();

    for (const row of nearRows) {
      // query_index identifies the source in multi-vector results; single-vector results may omit it.
      const source = sources[Number(row.query_index ?? 0)];
      const candidate = candidates.get(String(row.fileId));

      if (candidate) {
        if (!matches.has(source.fileId)) matches.set(source.fileId, []);

        matches.get(source.fileId).push({
          fileId: String(row.fileId),
          hash: candidate.hash,
          score: getSimilarityScore(getCosineSimilarity(source.vector, candidate.vector)),
        });
      }
    }

    return matches;
  }

  private async getVectorIndex(table: LanceTable) {
    return (await table.listIndices()).find((index) => index.columns.includes("vector"));
  }

  private getActiveTableDef(vectorType: SimilarityVectorType) {
    const tableName = this.manifest.activeTables[vectorType];

    if (!tableName) return null;

    const tableDef = this.manifest.tables[tableName];

    if (!tableDef || tableDef.status !== "active") return null;

    return tableDef;
  }

  private async getExistingRow(tableDef: VectorTableManifestEntry, fileId: string) {
    const table = await this.openValidTableIfExists(tableDef);

    if (!table) return null;

    return (
      (
        await table
          .query()
          .select(["fileId", "sourceHash"])
          .where(makeFileIdPredicate(fileId))
          .limit(1)
          .toArray()
      )[0] ?? null
    );
  }

  private async getOrCreateTable(tableDef: VectorTableManifestEntry) {
    const existing = await this.openValidTableIfExists(tableDef);

    if (existing) return { didCreate: false, table: existing };

    const table = await this.createTable(tableDef, []);

    await this.ensureScalarIndexes(table);

    return { didCreate: true, table };
  }

  private async indexVisualFile(fileId: string, force: boolean) {
    const file = await models.FileModel.findById(fileId).select({
      _id: 1,
      ext: 1,
      hash: 1,
      thumb: 1,
    });

    if (!file) return "missing-file";

    if (!file.thumb?.path) return "missing-thumb";

    if (!this.getIsVisualFile(file.ext)) return "unsupported-file-type";

    const tableDef = this.getActiveTableDef(VISUAL_VECTOR_TYPE);

    if (!tableDef) throw new Error("No active visual vector table is configured.");

    const existing = await this.getExistingRow(tableDef, fileId);

    if (!force && getIsFreshVectorRow(existing, file.hash)) return "fresh";

    const vector = await this.embedVisualSource(file.thumb.path, fileId, file.hash);

    if (!vector) throw new Error("Visual similarity vector generation returned no vector.");

    const row = this.makeVectorRow({ fileId, sourceHash: file.hash, tableDef, vector });

    const { table } = await this.getOrCreateTable(tableDef);

    await this.mergeInsertRows(tableDef, table, [row]);

    return existing ? "updated" : "indexed";
  }

  private makeVisualSource(file: any): VisualSourceItem {
    const fileId = file._id.toString();
    const kind = getIsAnimated(file.ext) ? "video" : "image";

    return {
      entityId: fileId,
      estimatedPixelCount: this.getEstimatedThumbnailPixelCount(file, kind),
      fileId,
      kind,
      ntfsFileId: file.thumb.ntfsFileId,
      ntfsVolumeId: file.thumb.ntfsVolumeId,
      sourceHash: file.hash,
      sourcePath: file.thumb.path,
    };
  }

  private getEstimatedThumbnailPixelCount(file: any, kind: VisualSourceItem["kind"]) {
    const height = Number(file.height);
    const width = Number(file.width);

    if (!Number.isFinite(height) || !Number.isFinite(width) || height <= 0 || width <= 0) return 0;

    const maxDimension = CONSTANTS.FILE.THUMB.MAX_DIM;

    if (kind === "image") return Math.round((width * maxDimension) / height) * maxDimension;

    const scaled = getScaledThumbSize(width, height);

    return (
      scaled.width *
      scaled.height *
      CONSTANTS.FILE.THUMB.GRID_COLUMNS *
      CONSTANTS.FILE.THUMB.GRID_ROWS
    );
  }

  private makeVectorRow(args: {
    fileId: string;
    sourceHash: string;
    tableDef: VectorTableManifestEntry;
    vector: number[];
  }) {
    return {
      entityId: args.fileId,
      fileId: args.fileId,
      indexedAt: new Date().toISOString(),
      modelId: args.tableDef.modelId,
      sourceHash: args.sourceHash,
      vector: args.vector,
      vectorVersion: args.tableDef.vectorVersion,
    };
  }

  private async writeVectorRows(args: {
    job?: SimilarityBackfillJob;
    rows: Record<string, any>[];
    tableDef: VectorTableManifestEntry;
  }) {
    if (!args.rows.length) return 0;

    args.job && this.assertJobNotCancelled(args.job);
    args.job && this.updateJobProgress(args.job, { stage: "writing" });

    const startedAt = Date.now();
    const { table } = await this.getOrCreateTable(args.tableDef);

    for (const rows of chunkArray(args.rows, getConfig().file.similarity.writerBatchSize)) {
      args.job && this.assertJobNotCancelled(args.job);
      await this.mergeInsertRows(args.tableDef, table, rows);
    }

    return Date.now() - startedAt;
  }

  private async getCurrentVectorRowsByFileId(args: {
    fileIds: string[];
    vectorTypes: SimilarityVectorType[];
  }) {
    const rowsByVectorType: Partial<Record<SimilarityVectorType, Map<string, any>>> = {};

    if (!args.fileIds.length) return rowsByVectorType;

    for (const vectorType of args.vectorTypes) {
      const tableDef = this.getActiveTableDef(vectorType);
      const table = tableDef ? await this.openValidTableIfExists(tableDef) : null;

      if (!table) {
        rowsByVectorType[vectorType] = new Map();
        continue;
      }

      const rows = await this.queryRowsByFileIds(table, args.fileIds, ["fileId", "sourceHash"]);

      rowsByVectorType[vectorType] = new Map(rows.map((row) => [String(row.fileId), row]));
    }

    return rowsByVectorType;
  }

  private async queryRowsByFileIds(table: LanceTable, fileIds: string[], columns: string[]) {
    const rows: any[] = [];

    for (const queryBatch of chunkArray(
      chunkArray(fileIds, MAX_FILE_ID_QUERY_SIZE),
      MAX_CONCURRENT_VECTOR_ROW_QUERIES,
    )) {
      rows.push(
        ...(
          await Promise.all(
            queryBatch.map((fileIdBatch) =>
              table.query().select(columns).where(makeFileIdsPredicate(fileIdBatch)).toArray(),
            ),
          )
        ).flat(),
      );
    }

    return rows;
  }

  private async openTableIfExists(tableName: string): Promise<LanceTable | null> {
    const cached = this.tables.get(tableName);

    if (cached) return cached;

    const tableNames = await this.db.tableNames();

    if (!tableNames.includes(tableName)) return null;

    const table = await this.db.openTable(tableName);

    this.tables.set(tableName, table);

    return table;
  }

  private async openValidTableIfExists(tableDef: VectorTableManifestEntry) {
    const table = await this.openTableIfExists(tableDef.tableName);

    if (!table) return null;

    const schemaState = await this.getTableSchemaState(tableDef, table);

    if (schemaState.isValid) return table;

    const recoveredTable = await this.restoreNewestValidTableVersion(tableDef, table);

    if (recoveredTable) return recoveredTable;

    throw new Error(
      `Similarity table ${tableDef.tableName} has an invalid schema and was not modified. Missing fields: ${schemaState.missingFields.join(", ")}.`,
    );
  }

  private async getTableSchemaState(tableDef: VectorTableManifestEntry, table: LanceTable) {
    try {
      const schema = await table.schema();
      const fieldNames = new Set(schema.fields.map((field) => field.name));

      const missingFields =
        tableDef.vectorType === VISUAL_VECTOR_TYPE
          ? VISUAL_REQUIRED_FIELDS.filter((fieldName) => !fieldNames.has(fieldName))
          : [];

      return {
        isValid: !missingFields.length,
        missingFields,
      };
    } catch {
      return {
        isValid: false,
        missingFields: [...VISUAL_REQUIRED_FIELDS],
      };
    }
  }

  private async createTable(tableDef: VectorTableManifestEntry, rows: Record<string, any>[]) {
    const schema = this.makeVectorSchema(tableDef);

    const table = rows.length
      ? await this.db.createTable(tableDef.tableName, this.makeArrowTable(tableDef, rows), {
          existOk: true,
          mode: "create",
        })
      : await this.db.createEmptyTable(tableDef.tableName, schema, {
          existOk: true,
          mode: "create",
        });

    const schemaState = await this.getTableSchemaState(tableDef, table);

    if (!schemaState.isValid) {
      throw new Error(
        `Created similarity table ${tableDef.tableName} with invalid schema. Missing fields: ${schemaState.missingFields.join(", ")}.`,
      );
    }

    try {
      await table.setUnenforcedPrimaryKey("entityId");
    } catch {}

    this.tables.set(tableDef.tableName, table);

    return table;
  }

  private makeVectorSchema(tableDef: VectorTableManifestEntry) {
    const vectorValueType = tableDef.vectorDType === "float16" ? new Float16() : new Float32();

    return new Schema([
      new Field("entityId", new Utf8(), false),
      new Field("fileId", new Utf8(), false),
      new Field("sourceHash", new Utf8(), false),
      new Field("modelId", new Utf8(), false),
      new Field("vectorVersion", new Utf8(), false),
      new Field("indexedAt", new Utf8(), false),
      new Field(
        "vector",
        new FixedSizeList(tableDef.dimensions, new Field("item", vectorValueType, false)),
        false,
      ),
    ]);
  }

  private makeArrowTable(tableDef: VectorTableManifestEntry, rows: Record<string, any>[]) {
    return this.lancedb.makeArrowTable(rows, { schema: this.makeVectorSchema(tableDef) });
  }

  private async mergeInsertRows(
    tableDef: VectorTableManifestEntry,
    table: LanceTable,
    rows: Record<string, any>[],
  ) {
    const previousVersion = await table.version();

    await table
      .mergeInsert("entityId")
      .whenMatchedUpdateAll()
      .whenNotMatchedInsertAll()
      .execute(this.makeArrowTable(tableDef, rows));

    const schemaState = await this.getTableSchemaState(tableDef, table);

    if (schemaState.isValid) return;

    await this.restoreTableVersion(tableDef, table, previousVersion);

    throw new Error(
      `Similarity table ${tableDef.tableName} became invalid after merge and was restored to version ${previousVersion}. Missing fields: ${schemaState.missingFields.join(", ")}.`,
    );
  }

  private async ensureScalarIndexes(table: LanceTable) {
    for (const column of ["entityId", "fileId", "sourceHash"]) {
      try {
        await table.createIndex(column, { replace: false });
      } catch (err) {
        if (!String(err.message).toLowerCase().includes("exist")) {
          fileLog(`[VECTOR] Failed to create ${column} scalar index: ${err.message}`, {
            type: "error",
          });
        }
      }
    }
  }

  private async restoreNewestValidTableVersion(
    tableDef: VectorTableManifestEntry,
    table: LanceTable,
  ) {
    let versions: Awaited<ReturnType<LanceTable["listVersions"]>> = [];

    try {
      versions = await table.listVersions();
    } catch {}

    const sortedVersions = versions.map((version) => version.version).sort((a, b) => b - a);

    for (const version of sortedVersions) {
      let candidate: LanceTable | null = null;

      try {
        candidate = await this.db.openTable(tableDef.tableName, [], { version });
      } catch {}

      if (!candidate) continue;

      const schemaState = await this.getTableSchemaState(tableDef, candidate);

      candidate.close();

      if (!schemaState.isValid) continue;

      await this.restoreTableVersion(tableDef, table, version);

      return table;
    }

    return null;
  }

  private async restoreTableVersion(
    tableDef: VectorTableManifestEntry,
    table: LanceTable,
    version: number,
  ) {
    await table.checkout(version);
    await table.restore();
    fileLog(`[VECTOR] Restored ${tableDef.tableName} to version ${version}.`, { type: "error" });
  }

  private async loadManifest() {
    const config = getConfig();
    const manifestPath = path.resolve(config.db.vector.path, MANIFEST_FILE_NAME);
    let manifest: VectorManifest;

    try {
      manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as VectorManifest;
    } catch {
      manifest = makeDefaultManifest();
      await this.writeManifest(manifest);
    }

    await this.migrateManifest(manifest);

    return manifest;
  }

  private async migrateManifest(manifest: VectorManifest) {
    let didChange = false;

    if (manifest.version !== 2) {
      manifest.version = 2;
      didChange = true;
    }

    for (const [tableName, tableDef] of Object.entries(manifest.tables)) {
      const migrated = this.makeManifestEntryV2(tableName, tableDef);

      if (JSON.stringify(migrated) !== JSON.stringify(tableDef)) {
        manifest.tables[tableName] = migrated;
        didChange = true;
      }
    }

    if (!manifest.tables[VISUAL_TABLE_NAME]) {
      manifest.tables[VISUAL_TABLE_NAME] = VISUAL_TABLE_DEF;
      didChange = true;
    }

    if (manifest.activeTables[VISUAL_VECTOR_TYPE] !== VISUAL_TABLE_NAME) {
      manifest.activeTables[VISUAL_VECTOR_TYPE] = VISUAL_TABLE_NAME;
      didChange = true;
    }

    if (didChange) await this.writeManifest(manifest);
  }

  private makeManifestEntryV2(tableName: string, tableDef: Partial<VectorTableManifestEntry>) {
    if (tableName === VISUAL_TABLE_NAME) return { ...VISUAL_TABLE_DEF, ...tableDef };
    else if (
      tableDef.vectorType === VISUAL_VECTOR_TYPE ||
      tableName.startsWith("file_visual_clip_")
    ) {
      return {
        ...VISUAL_TABLE_DEF,
        ...tableDef,
        indexType: "none" as VectorIndexType,
        status: "deprecated" as VectorTableStatus,
        tableName,
        vectorDType: "float32" as VectorDType,
      };
    } else {
      const policy =
        FUTURE_TABLE_POLICIES[tableDef.vectorType as Exclude<SimilarityVectorType, "visual">];

      return {
        dimensions: tableDef.dimensions ?? 0,
        distanceType: tableDef.distanceType ?? "cosine",
        indexType: tableDef.indexType ?? "ivf_pq",
        modelId: tableDef.modelId ?? "pending",
        scope: tableDef.scope ?? policy?.scope ?? "file",
        sourceKind: tableDef.sourceKind ?? policy?.sourceKind ?? "fileHash",
        status: tableDef.status ?? "deprecated",
        tableName,
        vectorDType: tableDef.vectorDType ?? getConfig().file.similarity.storageDType,
        vectorType: tableDef.vectorType,
        vectorVersion: tableDef.vectorVersion ?? "pending",
      } as VectorTableManifestEntry;
    }
  }

  private async ensureManifestActiveTables() {
    const { table } = await this.getOrCreateTable(VISUAL_TABLE_DEF);

    await this.ensureScalarIndexes(table);
  }

  private async writeManifest(manifest: VectorManifest) {
    const config = getConfig();

    await fs.mkdir(config.db.vector.path, { recursive: true });
    await fs.writeFile(
      path.resolve(config.db.vector.path, MANIFEST_FILE_NAME),
      JSON.stringify(manifest, null, 2),
    );
  }

  private async dropLegacyVisualTablesAfterValidatedMigration(
    job: SimilarityBackfillJob,
    args: SimilarityBackfillArgs,
  ) {
    if (args.fileIds?.length || job.progress.errorCount > 0 || job.cancelRequested) return;

    const table = await this.openValidTableIfExists(VISUAL_TABLE_DEF);

    if (!table) return;

    let rowCount = 0;

    try {
      rowCount = await table.countRows();
    } catch {}

    if (!rowCount) return;

    const tableNames = await this.db.tableNames();

    for (const tableName of VISUAL_LEGACY_TABLE_NAMES) {
      if (!tableNames.includes(tableName)) continue;

      const legacyTable = await this.openTableIfExists(tableName);
      let legacyRowCount = 0;

      try {
        legacyRowCount = (await legacyTable?.countRows()) ?? 0;
      } catch {}

      if (legacyRowCount > rowCount) {
        fileLog(
          `[VECTOR] Keeping legacy table ${tableName}; v4 row count ${rowCount} does not cover legacy row count ${legacyRowCount}.`,
          { type: "error" },
        );
        continue;
      }

      try {
        await this.db.dropTable(tableName);
      } catch (err) {
        fileLog(`[VECTOR] Failed to drop migrated legacy table ${tableName}: ${err.message}`, {
          type: "error",
        });
        continue;
      }

      this.tables.get(tableName)?.close();
      this.tables.delete(tableName);

      delete this.manifest.tables[tableName];
      fileLog(`[VECTOR] Dropped migrated legacy similarity table ${tableName}.`);
    }

    await this.writeManifest(this.manifest);
  }

  private getIsVisualFile(ext: string) {
    const config = getConfig();
    const visualExts: string[] = [...config.file.imageExts, ...config.file.videoExts];
    return visualExts.includes(ext?.toLowerCase?.());
  }

  private makeEmptyBatchResult(fileCount: number): SimilarityIndexBatchResult {
    return {
      errorCount: 0,
      fileCount,
      indexedCount: 0,
      migratedCount: 0,
      missingFileCount: 0,
      missingThumbCount: 0,
      skippedFreshCount: 0,
      timings: makeEmptyTimings(),
      unsupportedFileTypeCount: 0,
    };
  }

  private addTiming(
    job: SimilarityBackfillJob,
    key: keyof SimilarityBackfillTimings,
    value: number,
  ) {
    this.updateJobProgress(job, {
      timings: {
        ...job.progress.timings,
        [key]: job.progress.timings[key] + value,
      },
    });
  }

  private addCompletedRows(
    job: SimilarityBackfillJob,
    args: {
      decodeDiagnostics: SimilarityDecodeDiagnostics;
      decodeMs: number;
      errorCount: number;
      generatedCount: number;
      inferenceMs: number;
      migratedCount: number;
      processedCount: number;
      writeMs: number;
    },
  ) {
    this.updateJobProgress(job, {
      decodeDiagnostics: this.sumDecodeDiagnostics(
        job.progress.decodeDiagnostics,
        args.decodeDiagnostics,
      ),
      errorCount: job.progress.errorCount + args.errorCount,
      index: Math.min(job.progress.index + args.processedCount, job.progress.total),
      indexedCount: job.progress.indexedCount + args.generatedCount,
      migratedCount: job.progress.migratedCount + args.migratedCount,
      timings: {
        ...job.progress.timings,
        decodeMs: job.progress.timings.decodeMs + args.decodeMs,
        inferenceMs: job.progress.timings.inferenceMs + args.inferenceMs,
        writeMs: job.progress.timings.writeMs + args.writeMs,
      },
    });
  }

  private sumDecodeDiagnostics(
    left: SimilarityDecodeDiagnostics,
    right: SimilarityDecodeDiagnostics,
  ) {
    return {
      estimatedPixelCount: left.estimatedPixelCount + right.estimatedPixelCount,
      imageCount: left.imageCount + right.imageCount,
      imageMs: left.imageMs + right.imageMs,
      videoCount: left.videoCount + right.videoCount,
      videoMs: left.videoMs + right.videoMs,
    };
  }

  private addProcessedRows(
    job: SimilarityBackfillJob,
    args: {
      errorCount?: number;
      missingFileCount?: number;
      missingThumbCount?: number;
      processedCount: number;
      skippedFreshCount?: number;
      unsupportedFileTypeCount?: number;
    },
  ) {
    this.updateJobProgress(job, {
      errorCount: job.progress.errorCount + (args.errorCount ?? 0),
      index: Math.min(job.progress.index + args.processedCount, job.progress.total),
      missingFileCount: job.progress.missingFileCount + (args.missingFileCount ?? 0),
      missingThumbCount: job.progress.missingThumbCount + (args.missingThumbCount ?? 0),
      skippedFreshCount: job.progress.skippedFreshCount + (args.skippedFreshCount ?? 0),
      unsupportedFileTypeCount:
        job.progress.unsupportedFileTypeCount + (args.unsupportedFileTypeCount ?? 0),
    });
  }

  private updateJobProgress(
    job: SimilarityBackfillJob,
    updates: Partial<SimilarityBackfillProgress>,
  ) {
    const updatedAt = Date.now();
    const elapsedSeconds = (updatedAt - job.progress.startedAt) / 1000 || 1;
    const indexedTotal = updates.indexedCount ?? job.progress.indexedCount;

    job.progress = {
      ...job.progress,
      ...updates,
      averageRate: indexedTotal / elapsedSeconds,
      timings: {
        ...(updates.timings ?? job.progress.timings),
        totalMs: updatedAt - job.progress.startedAt,
      },
      updatedAt,
    };
  }

  private assertJobNotCancelled(job: SimilarityBackfillJob) {
    if (job.pauseRequested) throw new Error("Similarity backfill paused");

    if (job.cancelRequested) throw new Error("Similarity backfill cancelled");
  }
}

export const vectorSimilarityService = new VectorSimilarityService();
