import fs from "fs/promises";
import path from "path";
import { Field, FixedSizeList, Float16, Float32, Schema, Utf8 } from "apache-arrow";
import { randomUUID } from "crypto";
import * as models from "medior/_generated/server/models";
import { fileLog } from "trabecula/utils/server";
import { chunkArray } from "medior/utils/common";
import { getConfig } from "medior/utils/server/config";

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

export interface SimilarityCandidate {
  distance: number;
  fileId: string;
  rank: number;
  score: number;
  vectorTypeScores: Partial<Record<SimilarityVectorType, number>>;
}

export interface SimilarityBackfillTimings {
  decodeMs: number;
  existingRowsMs: number;
  inferenceMs: number;
  indexMs: number;
  mongoMs: number;
  sourcePrepMs: number;
  totalMs: number;
  vectorPostMs: number;
  writeMs: number;
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
  | "scanning"
  | "writing";

export type SimilarityBackfillStatus = "cancelled" | "complete" | "error" | "queued" | "running";

export interface SimilarityBackfillProgress {
  averageRate: number;
  completedAt?: number;
  currentRate: number;
  errorCount: number;
  index: number;
  indexedCount: number;
  jobId: string;
  message?: string;
  migratedCount: number;
  missingFileCount: number;
  missingThumbCount: number;
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
  fileId: string;
  sourceHash: string;
  sourcePath: string;
}

interface VisualDecodedItem extends VisualSourceItem {
  channels: 3;
  data: ArrayBuffer;
  height: number;
  width: number;
}

type LanceConnection = import("@lancedb/lancedb").Connection;
type LanceTable = import("@lancedb/lancedb").Table;
type LanceModule = typeof import("@lancedb/lancedb");

interface SimilarityBackfillJob {
  cancelRequested: boolean;
  progress: SimilarityBackfillProgress;
}

interface SimilarityBackfillArgs {
  fileIds?: string[];
  force?: boolean;
  vectorTypes?: SimilarityVectorType[];
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

const MANIFEST_FILE_NAME = "manifest.json";
const VISUAL_VECTOR_TYPE: SimilarityVectorType = "visual";
const VISUAL_MODEL_ID = "Xenova/dinov2-small";
const VISUAL_PREPROCESSOR_ID = "sharp-224-cover";
const VISUAL_TABLE_NAME = "file_visual_dinov2_small_v1";
const VISUAL_LEGACY_TABLE_NAMES = [
  "file_visual_dinov2_base_v1",
  "file_visual_clip_v4",
  "file_visual_clip_v3",
  "file_visual_clip_v2",
  "file_visual_clip_v1",
];
const VISUAL_VECTOR_DIMENSIONS = 384;
const VISUAL_VECTOR_VERSION = `dinov2-small:${VISUAL_PREPROCESSOR_ID}:float16:v1`;
const VISUAL_INPUT_SIZE = 224;
const VISUAL_DECODE_CONCURRENCY = 8;
const VISUAL_WRITE_FLUSH_ROW_COUNT = 512;
const MAX_FILE_ID_QUERY_SIZE = 500;
const DEFAULT_SCAN_BATCH_SIZE = 5000;
const VISUAL_REQUIRED_FIELDS = [
  "entityId",
  "fileId",
  "indexedAt",
  "modelId",
  "sourceHash",
  "vector",
  "vectorVersion",
] as const;

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

export class VectorSimilarityService {
  private db: LanceConnection;
  private imageFeatureExtractor: any;
  private jobs = new Map<string, SimilarityBackfillJob>();
  private lancedb: LanceModule;
  private manifest: VectorManifest;
  private shouldUsePooledVisualOutput = true;
  private RawImage: typeof import("@huggingface/transformers").RawImage;
  private sharp: any;

  async init() {
    const config = getConfig();
    await fs.mkdir(config.db.vector.path, { recursive: true });
    await fs.mkdir(config.file.similarity.modelCachePath, { recursive: true });

    this.lancedb = await import("@lancedb/lancedb");
    this.db = await this.lancedb.connect(config.db.vector.path);
    this.manifest = await this.loadManifest();
    await this.ensureManifestActiveTables();

    fileLog(`[VECTOR] LanceDB initialized at ${config.db.vector.path}`);
  }

  async findSimilarVectorCandidates(args: {
    fileId: string;
    limit?: number;
    vectorTypes?: SimilarityVectorType[];
  }) {
    const limit = args.limit ?? getConfig().file.similarity.defaultLimit;
    const vectorTypes = args.vectorTypes ?? [VISUAL_VECTOR_TYPE];
    let didSearchActiveTable = false;
    const weightedCandidates = new Map<
      string,
      {
        distance: number;
        fileId: string;
        scoreSum: number;
        vectorTypeScores: Partial<Record<SimilarityVectorType, number>>;
        weightSum: number;
      }
    >();

    for (const vectorType of vectorTypes) {
      const tableDef = this.getActiveTableDef(vectorType);
      if (!tableDef) continue;

      const weight = getConfig().file.similarity.weights[vectorType] ?? 0;
      if (weight <= 0) continue;

      await this.indexFileSimilarity({
        fileId: args.fileId,
        vectorTypes: [vectorType],
      });

      const candidates = this.normalizeScores(
        await this.findCandidatesForTable({
          fileId: args.fileId,
          limit: Math.max(limit * 3, limit + 1),
          tableDef,
        }),
      );
      didSearchActiveTable = true;

      for (const candidate of candidates) {
        if (candidate.fileId === args.fileId) continue;

        const existing =
          weightedCandidates.get(candidate.fileId) ??
          ({
            distance: candidate.distance,
            fileId: candidate.fileId,
            scoreSum: 0,
            vectorTypeScores: {},
            weightSum: 0,
          } satisfies {
            distance: number;
            fileId: string;
            scoreSum: number;
            vectorTypeScores: Partial<Record<SimilarityVectorType, number>>;
            weightSum: number;
          });

        existing.distance = Math.min(existing.distance, candidate.distance);
        existing.scoreSum += candidate.score * weight;
        existing.vectorTypeScores[vectorType] = candidate.score;
        existing.weightSum += weight;
        weightedCandidates.set(candidate.fileId, existing);
      }
    }

    if (!didSearchActiveTable)
      throw new Error("No active similarity vectors were found for this file yet.");
    if (!weightedCandidates.size) return [];

    return [...weightedCandidates.values()]
      .map((candidate) => ({
        distance: candidate.distance,
        fileId: candidate.fileId,
        score: candidate.weightSum > 0 ? candidate.scoreSum / candidate.weightSum : 0,
        vectorTypeScores: candidate.vectorTypeScores,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((candidate, idx) => ({ ...candidate, rank: idx + 1 }));
  }

  async indexFileSimilarity(args: {
    fileId: string;
    force?: boolean;
    vectorTypes?: SimilarityVectorType[];
  }) {
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
    const activeJob = [...this.jobs.values()].find(
      (job) => !getIsTerminalStatus(job.progress.status),
    );
    if (activeJob) return activeJob.progress;

    const vectorTypes = args.vectorTypes?.length ? args.vectorTypes : [VISUAL_VECTOR_TYPE];
    const jobId = randomUUID();
    const now = Date.now();
    const job: SimilarityBackfillJob = {
      cancelRequested: false,
      progress: {
        averageRate: 0,
        currentRate: 0,
        errorCount: 0,
        index: 0,
        indexedCount: 0,
        jobId,
        migratedCount: 0,
        missingFileCount: 0,
        missingThumbCount: 0,
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

    this.jobs.set(jobId, job);
    void this.runSimilarityBackfill(job, { ...args, vectorTypes });

    return job.progress;
  }

  getSimilarityBackfillProgress(args: { jobId: string }) {
    const job = this.jobs.get(args.jobId);
    if (!job) throw new Error(`Similarity backfill job not found: ${args.jobId}`);
    return job.progress;
  }

  async cancelSimilarityBackfill(args: { jobId: string }) {
    const job = this.jobs.get(args.jobId);
    if (!job) throw new Error(`Similarity backfill job not found: ${args.jobId}`);

    job.cancelRequested = true;
    this.updateJobProgress(job, {
      completedAt: Date.now(),
      message: "Similarity backfill cancelled.",
      stage: "cancelled",
      status: "cancelled",
    });

    return job.progress;
  }

  async indexFileSimilarityBatch(args: {
    fileIds: string[];
    force?: boolean;
    vectorTypes?: SimilarityVectorType[];
  }): Promise<SimilarityIndexBatchResult> {
    const result = this.makeEmptyBatchResult(args.fileIds.length);

    if (!args.fileIds.length) return result;
    const fileStart = Date.now();
    const files = await models.FileModel.find({ _id: { $in: args.fileIds } })
      .select({ _id: 1, ext: 1, hash: 1, thumb: 1 })
      .lean();
    result.timings.mongoMs += Date.now() - fileStart;

    await this.indexVisualFileDocs({
      files,
      force: !!args.force,
      result,
      vectorTypes: args.vectorTypes ?? [VISUAL_VECTOR_TYPE],
    });

    return result;
  }

  async listFilesNeedingSimilarityIndex(args: {
    afterFileId?: string;
    force?: boolean;
    includeTotal?: boolean;
    limit?: number;
    scanLimit?: number;
    vectorTypes?: SimilarityVectorType[];
  }) {
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

  private async runSimilarityBackfill(job: SimilarityBackfillJob, args: SimilarityBackfillArgs) {
    try {
      this.updateJobProgress(job, { stage: "scanning", status: "running" });

      if (args.vectorTypes?.includes(VISUAL_VECTOR_TYPE)) {
        await this.runVisualBackfill(job, args);
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
      const isCancelled = job.cancelRequested || err.message === "Similarity backfill cancelled";
      this.updateJobProgress(job, {
        completedAt: Date.now(),
        message: isCancelled ? "Similarity backfill cancelled." : err.message,
        stage: isCancelled ? "cancelled" : "error",
        status: isCancelled ? "cancelled" : "error",
      });
      if (!isCancelled)
        fileLog(`[VECTOR] Similarity backfill failed: ${err.message}`, { type: "error" });
    }
  }

  private async runVisualBackfill(job: SimilarityBackfillJob, args: SimilarityBackfillArgs) {
    const total = args.fileIds?.length ?? (await models.FileModel.estimatedDocumentCount());
    this.updateJobProgress(job, {
      stage: "scanning",
      total,
    });

    let cursor: string | undefined;
    let offset = 0;

    while (true) {
      this.assertJobNotCancelled(job);
      const mongoStart = Date.now();
      const files = args.fileIds?.length
        ? await models.FileModel.find({
            _id: { $in: args.fileIds.slice(offset, offset + DEFAULT_SCAN_BATCH_SIZE) },
          })
            .select({ _id: 1, ext: 1, hash: 1, thumb: 1 })
            .lean()
        : await models.FileModel.find(cursor ? { _id: { $gt: cursor } } : {})
            .sort({ _id: 1 })
            .limit(DEFAULT_SCAN_BATCH_SIZE)
            .select({ _id: 1, ext: 1, hash: 1, thumb: 1 })
            .lean();
      this.addTiming(job, "mongoMs", Date.now() - mongoStart);

      if (!files.length) break;

      cursor = files[files.length - 1]._id.toString();
      offset += DEFAULT_SCAN_BATCH_SIZE;

      const batchResult = this.makeEmptyBatchResult(files.length);
      await this.indexVisualFileDocs({
        files,
        force: !!args.force,
        job,
        result: batchResult,
        vectorTypes: args.vectorTypes ?? [VISUAL_VECTOR_TYPE],
      });

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
      const fileId = file._id.toString();
      if (!file) {
        args.result.missingFileCount++;
        sourcePrepMissingFileCount++;
        sourcePrepProcessedCount++;
        continue;
      }
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
    const pendingRows: Record<string, any>[] = [];
    const flushPendingRows = async () => {
      if (!pendingRows.length) return;
      const rows = pendingRows.splice(0, pendingRows.length);
      await this.writeVectorRows({
        generatedCount: rows.length,
        job: args.job,
        migratedCount: 0,
        rows,
        tableDef,
      });
      args.result.indexedCount += rows.length;
    };

    for (const sourceBatch of chunkArray(sourceItems, pipelineBatchSize)) {
      args.job && this.assertJobNotCancelled(args.job);
      const decoded = await this.decodeVisualSourceBatch({
        job: args.job,
        result: args.result,
        sourceItems: sourceBatch,
      });

      const batchRows = await this.embedVisualDecodedSources({
        decoded,
        job: args.job,
        result: args.result,
        tableDef,
      });
      const failedCount = sourceBatch.length - batchRows.length;
      if (failedCount) {
        args.result.errorCount += failedCount;
        if (args.job)
          this.addProcessedRows(args.job, {
            errorCount: failedCount,
            processedCount: failedCount,
          });
      }
      if (!batchRows.length) continue;

      pendingRows.push(...batchRows);
      if (pendingRows.length >= VISUAL_WRITE_FLUSH_ROW_COUNT) await flushPendingRows();
    }

    await flushPendingRows();

    fileLog(
      `[VECTOR] Indexed visual batch: files=${args.result.fileCount}, indexed=${args.result.indexedCount}, migrated=${args.result.migratedCount}, skipped=${args.result.skippedFreshCount}, errors=${args.result.errorCount}, decode=${args.result.timings.decodeMs}ms, inference=${args.result.timings.inferenceMs}ms, write=${args.result.timings.writeMs}ms`,
    );
  }

  private async decodeVisualSourceBatch(args: {
    job?: SimilarityBackfillJob;
    result: SimilarityIndexBatchResult;
    sourceItems: VisualSourceItem[];
  }) {
    const decodeStart = Date.now();
    if (args.job) this.updateJobProgress(args.job, { stage: "decoding" });
    const decoded = await this.decodeVisualSourcesInline(args.sourceItems);
    const decodeMs = Date.now() - decodeStart;
    args.result.timings.decodeMs += decodeMs;
    if (args.job) this.addTiming(args.job, "decodeMs", decodeMs);
    return decoded;
  }

  private async embedVisualDecodedSources(args: {
    decoded: VisualDecodedItem[];
    job?: SimilarityBackfillJob;
    result: SimilarityIndexBatchResult;
    tableDef: VectorTableManifestEntry;
  }) {
    if (!args.decoded.length) return [];
    const rows: Record<string, any>[] = [];

    const inferenceStart = Date.now();
    if (args.job) {
      this.assertJobNotCancelled(args.job);
      this.updateJobProgress(args.job, { stage: "inferencing" });
    }
    const vectors = await this.inferVisualDecodedItemsInline(args.decoded);
    const inferenceMs = Date.now() - inferenceStart;
    args.result.timings.inferenceMs += inferenceMs;
    if (args.job) this.addTiming(args.job, "inferenceMs", inferenceMs);

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

    return rows;
  }

  private async embedVisualSource(sourcePath: string, fileId: string, sourceHash: string) {
    const decoded = await this.decodeVisualSourcesInline([
      { entityId: fileId, fileId, sourceHash, sourcePath },
    ]);
    const vectors = await this.inferVisualDecodedItemsInline(decoded);
    return vectors[0]?.vector;
  }

  private async decodeVisualSourcesInline(sourceItems: VisualSourceItem[]) {
    const sharp = await this.getSharp();
    const decoded: VisualDecodedItem[] = [];
    let nextIndex = 0;

    const decodeNext = async () => {
      while (nextIndex < sourceItems.length) {
        const item = sourceItems[nextIndex++];

        try {
          const { data, info } = await sharp(item.sourcePath, {
            failOn: "none",
            limitInputPixels: false,
          })
            .rotate()
            .resize(VISUAL_INPUT_SIZE, VISUAL_INPUT_SIZE, {
              fit: "cover",
              position: "centre",
            })
            .toColorspace("srgb")
            .removeAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });

          if (info.channels !== 3) {
            throw new Error(
              `Unexpected visual source channel count: ${info.channels}. Expected 3.`,
            );
          }

          decoded.push({
            ...item,
            channels: 3,
            data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
            height: info.height,
            width: info.width,
          });
        } catch (err) {
          fileLog(`[VECTOR] Failed visual similarity decode for ${item.fileId}: ${err.message}`, {
            type: "error",
          });
        }
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(VISUAL_DECODE_CONCURRENCY, sourceItems.length) }, decodeNext),
    );

    return decoded;
  }

  private async inferVisualDecodedItemsInline(items: VisualDecodedItem[]) {
    if (!items.length) return [];
    const extractor = await this.getImageFeatureExtractor();
    const images = items.map(
      (item) => new this.RawImage(new Uint8ClampedArray(item.data), item.width, item.height, 3),
    );
    const tensor = await this.extractVisualFeatures(extractor, images);
    const vectors = this.extractVisualFeatureVectors(tensor, items.length);

    return items.map((item, idx) => ({
      ...item,
      vector: normalizeVector(vectors[idx]),
    }));
  }

  private async extractVisualFeatures(extractor: any, images: any[]) {
    if (!this.shouldUsePooledVisualOutput) return await extractor(images);

    try {
      return await extractor(images, { pool: true });
    } catch (err) {
      if (!String(err.message).includes("No pooled output was returned")) throw err;

      this.shouldUsePooledVisualOutput = false;
      fileLog("[VECTOR] DINO model did not return pooled output; falling back to CLS token.");
      return await extractor(images);
    }
  }

  private extractVisualFeatureVectors(tensor: any, batchSize: number) {
    const values = Array.from(tensor.data, Number);
    const dims = tensor.dims as number[] | undefined;

    if (dims?.length === 2 && dims[0] === batchSize && dims[1] === VISUAL_VECTOR_DIMENSIONS) {
      return Array.from({ length: batchSize }, (_, idx) =>
        values.slice(idx * VISUAL_VECTOR_DIMENSIONS, (idx + 1) * VISUAL_VECTOR_DIMENSIONS),
      );
    }

    if (dims?.length === 3 && dims[0] === batchSize && dims[2] === VISUAL_VECTOR_DIMENSIONS) {
      const tokenCount = dims[1];
      return Array.from({ length: batchSize }, (_, idx) => {
        const offset = idx * tokenCount * VISUAL_VECTOR_DIMENSIONS;
        return values.slice(offset, offset + VISUAL_VECTOR_DIMENSIONS);
      });
    }

    const expectedLength = batchSize * VISUAL_VECTOR_DIMENSIONS;
    if (values.length === expectedLength) {
      return Array.from({ length: batchSize }, (_, idx) =>
        values.slice(idx * VISUAL_VECTOR_DIMENSIONS, (idx + 1) * VISUAL_VECTOR_DIMENSIONS),
      );
    }

    throw new Error(
      `Unexpected visual vector shape: ${dims?.join("x") ?? values.length}. Expected ${batchSize}x${VISUAL_VECTOR_DIMENSIONS} or ${batchSize}xNx${VISUAL_VECTOR_DIMENSIONS}.`,
    );
  }

  private async getSharp() {
    if (!this.sharp) {
      const sharpMod = await import("sharp");
      this.sharp = sharpMod.default ?? sharpMod;
    }
    return this.sharp;
  }

  private async getImageFeatureExtractor() {
    if (this.imageFeatureExtractor) return this.imageFeatureExtractor;

    const config = getConfig();
    const transformers = await import("@huggingface/transformers");
    transformers.env.cacheDir = config.file.similarity.modelCachePath;
    this.RawImage = transformers.RawImage;
    const batchSize = this.getVisualInferenceBatchSize();
    const dtype = this.getVisualInferenceDType();
    fileLog(
      `[VECTOR] Loading visual similarity model ${VISUAL_MODEL_ID} device=${config.file.similarity.visual.device} dtype=${dtype} batchSize=${batchSize}`,
    );
    this.imageFeatureExtractor = await transformers.pipeline(
      "image-feature-extraction",
      VISUAL_MODEL_ID,
      {
        cache_dir: config.file.similarity.modelCachePath,
        device: config.file.similarity.visual.device,
        dtype,
      },
    );
    fileLog(
      `[VECTOR] Loaded visual similarity model ${VISUAL_MODEL_ID} device=${config.file.similarity.visual.device} dtype=${dtype}`,
    );

    return this.imageFeatureExtractor;
  }

  private getVisualInferenceBatchSize() {
    const configured = getConfig().file.similarity.visual.inferenceBatchSize;
    return Math.max(1, configured);
  }

  private getVisualInferenceDType() {
    const config = getConfig().file.similarity.visual;
    if (config.device === "dml" && config.inferenceDType === "fp16") return "fp32";
    return config.inferenceDType;
  }

  private async findCandidatesForTable(args: {
    fileId: string;
    limit: number;
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

    const config = getConfig().file.similarity.index.ivfPq;
    return (
      await table
        .vectorSearch(Array.from(sourceRow.vector, Number))
        .column("vector")
        .distanceType(args.tableDef.distanceType)
        .nprobes(config.nprobes)
        .refineFactor(config.refineFactor)
        .select(["fileId"])
        .limit(args.limit)
        .toArray()
    ).map((row) => {
      const distance = Number(row._distance ?? 1);
      return {
        distance,
        fileId: String(row.fileId),
        score: Math.max(0, 1 - distance),
      };
    });
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
          .select(["entityId", "fileId", "sourceHash", "vector"])
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
    return {
      entityId: fileId,
      fileId,
      sourceHash: file.hash,
      sourcePath: file.thumb.path,
    };
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
    generatedCount: number;
    job?: SimilarityBackfillJob;
    migratedCount: number;
    rows: Record<string, any>[];
    tableDef: VectorTableManifestEntry;
  }) {
    if (!args.rows.length) return;
    args.job && this.assertJobNotCancelled(args.job);
    args.job && this.updateJobProgress(args.job, { stage: "writing" });

    const startedAt = Date.now();
    const { table } = await this.getOrCreateTable(args.tableDef);

    for (const rows of chunkArray(args.rows, getConfig().file.similarity.writerBatchSize)) {
      args.job && this.assertJobNotCancelled(args.job);
      await this.mergeInsertRows(args.tableDef, table, rows);
    }

    const writeMs = Date.now() - startedAt;
    if (args.job) {
      this.addTiming(args.job, "writeMs", writeMs);
      this.addCompletedRows(args.job, {
        generatedCount: args.generatedCount,
        migratedCount: args.migratedCount,
      });
    }
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

      const rows = await this.queryRowsByFileIds(table, args.fileIds, [
        "entityId",
        "fileId",
        "sourceHash",
        "vector",
      ]);
      rowsByVectorType[vectorType] = new Map(rows.map((row) => [String(row.fileId), row]));
    }

    return rowsByVectorType;
  }

  private async queryRowsByFileIds(table: LanceTable, fileIds: string[], columns: string[]) {
    const rows: any[] = [];
    for (const fileIdBatch of chunkArray(fileIds, MAX_FILE_ID_QUERY_SIZE)) {
      if (!fileIdBatch.length) continue;
      rows.push(
        ...(await table.query().select(columns).where(makeFileIdsPredicate(fileIdBatch)).toArray()),
      );
    }
    return rows;
  }

  private async openTableIfExists(tableName: string): Promise<LanceTable | null> {
    const tableNames = await this.db.tableNames();
    if (!tableNames.includes(tableName)) return null;
    return await this.db.openTable(tableName);
  }

  private async openValidTableIfExists(tableDef: VectorTableManifestEntry) {
    const table = await this.openTableIfExists(tableDef.tableName);
    if (!table) return null;
    const schemaState = await this.getTableSchemaState(tableDef, table);
    if (schemaState.isValid) return table;

    const recoveredTable = await this.restoreNewestValidTableVersion(tableDef, table);
    if (recoveredTable) return recoveredTable;

    throw new Error(
      `Similarity table ${tableDef.tableName} has an invalid schema and was not modified. Missing fields: ${schemaState.missingFields.join(", ")}. Rows: ${schemaState.rowCount ?? "unknown"}.`,
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
      const rowCount = await table.stats().then((stats) => stats.numRows);
      return {
        isValid: !missingFields.length,
        missingFields,
        rowCount,
        userFieldCount: schema.fields.length,
      };
    } catch {
      return {
        isValid: false,
        missingFields: [...VISUAL_REQUIRED_FIELDS],
        rowCount: null,
        userFieldCount: null,
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

    await table.setUnenforcedPrimaryKey("entityId").catch(() => undefined);
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
      await table.createIndex(column).catch((err) => {
        if (!String(err.message).toLowerCase().includes("exist")) {
          fileLog(`[VECTOR] Failed to create ${column} scalar index: ${err.message}`, {
            type: "error",
          });
        }
      });
    }
  }

  private async restoreNewestValidTableVersion(
    tableDef: VectorTableManifestEntry,
    table: LanceTable,
  ) {
    const versions = await table.listVersions().catch(() => []);
    const sortedVersions = versions.map((version) => version.version).sort((a, b) => b - a);

    for (const version of sortedVersions) {
      const candidate = await this.db
        .openTable(tableDef.tableName, [], { version })
        .catch(() => null);
      if (!candidate) continue;

      const schemaState = await this.getTableSchemaState(tableDef, candidate);
      if (!schemaState.isValid) continue;

      await this.restoreTableVersion(tableDef, table, version);
      return await this.db.openTable(tableDef.tableName);
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

    if (tableDef.vectorType === VISUAL_VECTOR_TYPE || tableName.startsWith("file_visual_clip_")) {
      return {
        ...VISUAL_TABLE_DEF,
        ...tableDef,
        indexType: "none" as VectorIndexType,
        status: "deprecated" as VectorTableStatus,
        tableName,
        vectorDType: "float32" as VectorDType,
      };
    }

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
    const rowCount = await table.countRows().catch(() => 0);
    if (!rowCount) return;

    const tableNames = await this.db.tableNames();
    for (const tableName of VISUAL_LEGACY_TABLE_NAMES) {
      if (!tableNames.includes(tableName)) continue;
      const legacyTable = await this.openTableIfExists(tableName);
      const legacyRowCount = (await legacyTable?.countRows().catch(() => 0)) ?? 0;
      if (legacyRowCount > rowCount) {
        fileLog(
          `[VECTOR] Keeping legacy table ${tableName}; v4 row count ${rowCount} does not cover legacy row count ${legacyRowCount}.`,
          { type: "error" },
        );
        continue;
      }

      const didDrop = await this.db.dropTable(tableName).then(
        () => true,
        (err) => {
          fileLog(`[VECTOR] Failed to drop migrated legacy table ${tableName}: ${err.message}`, {
            type: "error",
          });
          return false;
        },
      );
      if (!didDrop) continue;

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

  private normalizeScores(candidates: { distance: number; fileId: string; score: number }[]) {
    if (!candidates.length) return candidates;

    const scores = candidates.map((candidate) => candidate.score);
    const minScore = Math.min(...scores);
    const maxScore = Math.max(...scores);
    if (maxScore === minScore) return candidates.map((candidate) => ({ ...candidate, score: 1 }));

    return candidates.map((candidate) => ({
      ...candidate,
      score: (candidate.score - minScore) / (maxScore - minScore),
    }));
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
    args: { generatedCount: number; migratedCount: number },
  ) {
    const processedCount = args.generatedCount + args.migratedCount;
    this.updateJobProgress(job, {
      index: Math.min(job.progress.index + processedCount, job.progress.total),
      indexedCount: job.progress.indexedCount + args.generatedCount,
      migratedCount: job.progress.migratedCount + args.migratedCount,
    });
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
    if (job.cancelRequested) throw new Error("Similarity backfill cancelled");
  }
}

export const vectorSimilarityService = new VectorSimilarityService();
