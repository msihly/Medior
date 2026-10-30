import autoBind from "auto-bind";
import { ObjectId } from "bson";
import { computed, reaction } from "mobx";
import { Model, model, modelAction, modelFlow, prop } from "mobx-keystone";
import type { ImportStatus } from "medior/server/database";
import { asyncAction } from "medior/utils/client";
import {
  IMPORT_UPLOAD_BYTES,
  IMPORT_UPLOAD_COUNT,
  ImportBatchInput,
  ImportBatchOptions,
  ImportEntryInput,
  sleep,
  TaskProgress,
} from "medior/utils/common";
import { rpc } from "medior/utils/server";
import { FileImportBatch, FileImportBatchSearch } from ".";

@model("medior/ImportManager")
export class ImportManager extends Model({
  activeBatch: prop<FileImportBatch>(null).withSetter(),
  activeFilePath: prop<string>(null).withSetter(),
  activeFileProgress: prop<TaskProgress>(null).withSetter(),
  isImporting: prop<boolean>(false).withSetter(),
  isLoading: prop<boolean>(false).withSetter(),
  isOpen: prop<boolean>(false).withSetter(),
  isPaused: prop<boolean>(false).withSetter(),
  isReady: prop<boolean>(false).withSetter(),
  search: prop<FileImportBatchSearch>(() => new FileImportBatchSearch({})),
}) {
  private activeBatchLoadRevision = 0;
  private queuedStatusCountIds = new Set<string>();
  private statusCountsRevision = 0;
  private statusCountsRevisions = new Map<string, number>();
  private statusCountsTimer: ReturnType<typeof setTimeout> = null;

  onInit() {
    autoBind(this);

    reaction(
      () => this.isOpen,
      () => {
        if (!this.isOpen) {
          clearTimeout(this.statusCountsTimer);
          this.statusCountsTimer = null;
          this.queuedStatusCountIds.clear();
          this.statusCountsRevisions.clear();
          this.setIsLoading(true);
          this.search.reset();
        } else {
          this.setIsLoading(false);
          this.setIsReady(false);
          this.getImporterStatus();
        }
      },
    );

    // Each loaded page of batches fetches its counts together.
    reaction(
      () => this.search.results,
      (results, previousResults) => {
        const previousBatches = new Set(previousResults);
        const ids = results.filter((batch) => !previousBatches.has(batch)).map((batch) => batch.id);

        if (this.isOpen && ids.length) this.loadStatusCounts(ids);
      },
    );
  }

  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  applyStatusCounts(counts: Record<string, Partial<Record<ImportStatus, number>>>) {
    if (this.activeBatch && counts[this.activeBatch.id])
      this.activeBatch.setStatusCounts({ ...counts[this.activeBatch.id] });

    for (const batch of this.search.results) {
      if (counts[batch.id]) batch.setStatusCounts({ ...counts[batch.id] });
    }
  }

  /** Imports in progress refresh each loaded batch's counts at most once per second. */
  queueStatusCounts(id: string) {
    if (!this.isOpen) return;

    this.queuedStatusCountIds.add(id);

    if (!this.statusCountsTimer)
      this.statusCountsTimer = setTimeout(() => {
        const ids = [...this.queuedStatusCountIds].filter(
          (queuedId) => this.activeBatch?.id === queuedId || this.search.getResult(queuedId),
        );

        this.statusCountsTimer = null;
        this.queuedStatusCountIds.clear();

        if (ids.length) this.loadStatusCounts(ids);
      }, 1000);
  }

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  createImportBatches = asyncAction(
    async ({
      batches,
      isCancelled,
      onProgress,
    }: {
      batches: ImportBatchInput[];
      isCancelled?: () => boolean;
      onProgress?: (completed: number, total: number) => void;
    }) => {
      const ids: string[] = [];
      const total = batches.reduce((count, batch) => count + batch.imports.length, 0);
      let completed = 0;

      for (const batch of batches) {
        if (!batch.imports.length) continue;

        onProgress?.(completed, total);

        const { imports, ...options } = batch;
        const result = await this.uploadImportBatch({
          imports,
          isCancelled,
          onProgress: (count) => onProgress?.(completed + count, total),
          options,
        });

        if (!result.success)
          throw new Error(`Queued ${completed} of ${total} files before failure: ${result.error}`);

        ids.push(result.data.id);
        completed += batch.imports.length;
        onProgress?.(completed, total);
        await sleep(0);
      }

      return { count: ids.length, ids };
    },
  );

  @modelFlow
  deleteBatches = asyncAction(async (ids: string[]) => {
    await this.pauseImporter();

    const deleteRes = await rpc.deleteImportBatches({ ids });

    if (!deleteRes.success) throw new Error(deleteRes.error);

    this.search._deleteResults(ids);
    this.search.toggleSelected(ids.map((id) => ({ id, isSelected: false })));
    await this.loadActiveBatch();
    await this.search.loadFiltered({ withFullCount: true });
    await this.getImporterStatus();
  });

  @modelFlow
  getImporterStatus = asyncAction(async () => {
    const res = await rpc.getImporterStatus();

    if (!res.success) throw new Error(res.error);

    const wasReady = this.isReady;

    this.setIsImporting(res.data.isImporting);
    this.setIsPaused(res.data.isPaused);
    this.setIsReady(res.data.isReady);

    // The manager loads once the importer is ready; later status changes update it through sockets.
    if (this.isOpen && this.isReady && !wasReady)
      await Promise.all([this.loadActiveBatch(), this.search.loadFiltered()]);

    return res.data;
  });

  @modelFlow
  loadActiveBatch = asyncAction(async () => {
    const revision = ++this.activeBatchLoadRevision;

    this.setIsLoading(true);

    try {
      const batchRes = await rpc.getNextImportBatch();

      if (!batchRes.success) throw new Error(batchRes.error);

      if (revision !== this.activeBatchLoadRevision) return null;

      const batch = batchRes.data;

      if (!batch) {
        this.setActiveBatch(null);
        this.setActiveFilePath(null);
        this.setActiveFileProgress(null);
      } else if (this.activeBatch?.id === batch.id) {
        this.activeBatch.updateHeader(batch);

        if (this.isOpen) this.activeBatch.loadPage();
      } else {
        this.setActiveBatch(new FileImportBatch(batch));
      }

      if (batch && this.isOpen) this.loadStatusCounts([batch.id]);

      const tagIds = batch?.tagIds ?? [];
      const tagRes = tagIds.length
        ? await rpc.listTag({ filter: { id: tagIds } })
        : { data: [], error: null, success: true };

      if (!tagRes.success) throw new Error(tagRes.error);

      if (batch && revision === this.activeBatchLoadRevision && this.activeBatch?.id === batch.id)
        this.activeBatch.setTags(tagRes.data);

      return batch;
    } finally {
      if (revision === this.activeBatchLoadRevision) this.setIsLoading(false);
    }
  });

  @modelFlow
  loadStatusCounts = asyncAction(async (ids: string[]) => {
    const revision = ++this.statusCountsRevision;

    for (const id of ids) this.statusCountsRevisions.set(id, revision);

    const res = await rpc.getImportBatchStatusCounts({ ids });
    if (!res.success) throw new Error(res.error);

    // Counts apply only from each batch's latest request.
    const counts = Object.fromEntries(
      Object.entries(res.data).filter(([id]) => this.statusCountsRevisions.get(id) === revision),
    );

    for (const id of Object.keys(counts)) this.statusCountsRevisions.delete(id);

    this.applyStatusCounts(counts);
  });

  @modelFlow
  pauseImporter = asyncAction(async () => {
    const res = await rpc.pauseImporter();

    if (res.error) throw new Error(res.error);

    await this.getImporterStatus();
  });

  @modelFlow
  reprocessStoredImports = asyncAction(async (args: { id: string }) => {
    await this.pauseImporter();

    const res = await rpc.reprocessStoredImports({ id: args.id });

    if (!res.success) throw new Error(res.error);

    await this.loadActiveBatch();
    await this.getImporterStatus();

    return res.data;
  });

  @modelFlow
  runImporter = asyncAction(async () => {
    if (this.isImporting) return;

    if (!this.activeBatch) {
      const loaded = await this.loadActiveBatch();

      if (!loaded.success) throw new Error(loaded.error);
    }

    if (!this.activeBatch) return;

    const res = await rpc.runImportBatch({ id: this.activeBatch.id });

    if (res.error) throw new Error(res.error);

    await this.getImporterStatus();
  });

  @modelFlow
  togglePaused = asyncAction(async () => {
    if (this.isPaused && !this.isImporting) return this.runImporter();
    else {
      const res = await (this.isPaused ? rpc.resumeImporter() : rpc.pauseImporter());

      if (res.error) throw new Error(res.error);

      await this.getImporterStatus();
    }
  });

  @modelFlow
  uploadImportBatch = asyncAction(
    async ({
      imports,
      isCancelled,
      onProgress,
      options,
    }: {
      imports: AsyncIterable<ImportEntryInput> | Iterable<ImportEntryInput>;
      isCancelled?: () => boolean;
      onProgress?: (count: number) => void;
      options: ImportBatchOptions;
    }) => {
      const id = new ObjectId().toHexString();
      let count = 0;
      let entries: ImportEntryInput[] = [];
      let size = 2;

      const retryUploadRequest = async <T>(send: () => Promise<T>) => {
        try {
          return await send();
        } catch {
          return await send();
        }
      };

      const flush = async () => {
        if (isCancelled?.()) throw new Error("Import upload cancelled");

        if (entries.length) {
          const result = await retryUploadRequest(() =>
            rpc.appendImportBatchEntries({ id, imports: entries, offset: count }),
          );

          if (!result.success) throw new Error(result.error);

          count = result.data.count;
          entries = [];
          size = 2;
          onProgress?.(count);
          await sleep(0);
        }
      };

      try {
        const started = await retryUploadRequest(() =>
          rpc.beginImportBatchUpload({ ...options, id }),
        );

        if (!started.success) throw new Error(started.error);

        for await (const entry of imports) {
          if (isCancelled?.()) throw new Error("Import upload cancelled");

          const input: ImportEntryInput = {
            dateCreated: entry.dateCreated,
            diffusionParams: entry.diffusionParams,
            extension: entry.extension,
            name: entry.name,
            path: entry.path,
            sidecar: entry.sidecar,
            size: entry.size,
            subtitles: entry.subtitles,
            tagIds: [...new Set(entry.tagIds ?? [])],
          };
          const bytes = Buffer.byteLength(JSON.stringify(input), "utf8");

          if (bytes + 2 > IMPORT_UPLOAD_BYTES)
            throw new Error(`Import metadata is too large: ${entry.path}`);

          if (entries.length >= IMPORT_UPLOAD_COUNT || size + bytes + 1 > IMPORT_UPLOAD_BYTES)
            await flush();

          size += bytes + (entries.length ? 1 : 0);
          entries.push(input);
        }

        await flush();

        if (count) {
          const finished = await retryUploadRequest(() =>
            rpc.finishImportBatchUpload({ count, id }),
          );

          if (!finished.success) throw new Error(finished.error);
        } else {
          const discarded = await rpc.discardImportBatchUpload({ id });

          if (!discarded.success) throw new Error(discarded.error);
        }

        return { count, id: count ? id : null };
      } catch (error) {
        let batch: Awaited<ReturnType<typeof rpc.getImportBatch>>;

        try {
          batch = await rpc.getImportBatch({ id });
        } catch {
          throw new Error(
            `${error.message}. Could not confirm upload ${id}; check Import Manager before retrying.`,
          );
        }

        if (batch.success && batch.data?.isReady && batch.data.fileCount === count) {
          return { count, id };
        } else {
          const discarded = await rpc.discardImportBatchUpload({ id });

          if (!discarded.success)
            throw new Error(
              `${error.message}. The incomplete upload remains in Import Manager: ${discarded.error}`,
            );

          throw error;
        }
      }
    },
  );

  /* --------------------------------- GETTERS -------------------------------- */
  @computed
  get bytesCompleted() {
    return this.activeBatch ? this.activeBatch.processedSize : 0;
  }

  @computed
  get bytesTotal() {
    return this.activeBatch ? this.activeBatch.size : 0;
  }
}
