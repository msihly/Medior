import autoBind from "auto-bind";
import { ObjectId } from "bson";
import { computed, reaction } from "mobx";
import { Model, model, modelAction, modelFlow, prop } from "mobx-keystone";
import { asyncAction } from "trabecula/utils/client";
import {
  IMPORT_UPLOAD_BYTES,
  IMPORT_UPLOAD_COUNT,
  ImportBatchInput,
  ImportBatchOptions,
  ImportEntryInput,
} from "medior/utils/common";
import { trpc } from "medior/utils/server";
import { FileImportBatch, FileImportBatchSearch } from ".";

@model("medior/ImportManager")
export class ImportManager extends Model({
  activeBatch: prop<FileImportBatch>(null).withSetter(),
  activeFilePath: prop<string>(null).withSetter(),
  activeFileProgress: prop<{ elapsed: number; message: string; progress?: number }>(
    null,
  ).withSetter(),
  isImporting: prop<boolean>(false).withSetter(),
  isLoading: prop<boolean>(false).withSetter(),
  isOpen: prop<boolean>(false).withSetter(),
  isPaused: prop<boolean>(false).withSetter(),
  isReady: prop<boolean>(false).withSetter(),
  search: prop<FileImportBatchSearch>(() => new FileImportBatchSearch({})),
}) {
  private activeBatchLoadRevision = 0;

  onInit() {
    autoBind(this);
    reaction(
      () => this.isOpen,
      () => {
        if (!this.isOpen) {
          this.setIsLoading(true);
          this.search.reset();
        } else {
          this.setIsLoading(false);
          this.getImporterStatus();
        }
      },
    );
  }

  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  _deleteBatch(id: string) {
    this.search._deleteResults([id]);
  }

  reset() {
    this.activeBatchLoadRevision++;
    this.setActiveBatch(null);
    this.setActiveFilePath(null);
    this.setActiveFileProgress(null);
    this.setIsLoading(false);
    this.search.reset();
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
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }

      return { count: ids.length, ids };
    },
  );

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
        let result: T;

        try {
          result = await send();
        } catch {
          result = await send();
        }

        return result;
      };

      const flush = async () => {
        if (isCancelled?.()) throw new Error("Import upload cancelled");

        if (entries.length) {
          const result = await retryUploadRequest(() =>
            trpc.appendImportBatchEntries.mutate({ id, imports: entries, offset: count }),
          );

          if (!result.success) throw new Error(result.error);

          count = result.data.count;
          entries = [];
          size = 2;
          onProgress?.(count);
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        }
      };

      try {
        const started = await retryUploadRequest(() =>
          trpc.beginImportBatchUpload.mutate({ ...options, id }),
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
            size: entry.size,
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
            trpc.finishImportBatchUpload.mutate({ count, id }),
          );

          if (!finished.success) throw new Error(finished.error);
        } else {
          const discarded = await trpc.discardImportBatchUpload.mutate({ id });

          if (!discarded.success) throw new Error(discarded.error);
        }

        return { count, id: count ? id : null };
      } catch (error) {
        let batch: Awaited<ReturnType<typeof trpc.getImportBatch.mutate>>;

        try {
          batch = await trpc.getImportBatch.mutate({ id });
        } catch {
          throw new Error(
            `${error.message}. Could not confirm upload ${id}; check Import Manager before retrying.`,
          );
        }

        if (batch.success && batch.data?.isReady && batch.data.fileCount === count) {
          return { count, id };
        } else {
          const discarded = await trpc.discardImportBatchUpload.mutate({ id });

          if (!discarded.success)
            throw new Error(
              `${error.message}. The incomplete upload remains in Import Manager: ${discarded.error}`,
            );

          throw error;
        }
      }
    },
  );

  @modelFlow
  deleteBatch = asyncAction(async (args: { id: string }) => {
    await this.pauseImporter();

    const deleteRes = await trpc.deleteImportBatches.mutate({ ids: [args.id] });

    if (!deleteRes.success) throw new Error(deleteRes.error);

    this._deleteBatch(args.id);
    await this.loadActiveBatch();
    await this.getImporterStatus();
  });

  @modelFlow
  getImporterStatus = asyncAction(async () => {
    const res = await trpc.getImporterStatus.mutate();

    if (!res.success) throw new Error(res.error);

    this.setIsImporting(res.data.isImporting);
    this.setIsPaused(res.data.isPaused);
    this.setIsReady(res.data.isReady);

    if (this.isOpen && this.isReady)
      await Promise.all([this.loadActiveBatch(), this.search.loadFiltered()]);

    return res.data;
  });

  @modelFlow
  loadActiveBatch = asyncAction(async () => {
    const revision = ++this.activeBatchLoadRevision;

    this.setIsLoading(true);

    try {
      const batchRes = await trpc.getNextImportBatch.mutate();

      if (!batchRes.success) throw new Error(batchRes.error);

      if (revision !== this.activeBatchLoadRevision) return null;

      const batch = batchRes.data;

      if (!batch) {
        this.setActiveBatch(null);
      } else if (this.activeBatch?.id === batch.id) {
        this.activeBatch.updateHeader(batch);

        if (this.isOpen) this.activeBatch.loadPage();
      } else {
        this.setActiveBatch(new FileImportBatch(batch));
      }

      const tagIds = batch?.tagIds ?? [];
      const tagRes = tagIds.length
        ? await trpc.listTag.mutate({ filter: { id: tagIds } })
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
  pauseImporter = asyncAction(async () => {
    const res = await trpc.pauseImporter.mutate();

    if (res.error) throw new Error(res.error);

    await this.getImporterStatus();
  });

  @modelFlow
  runImporter = asyncAction(async () => {
    if (this.isImporting) return;

    if (!this.activeBatch) {
      const loaded = await this.loadActiveBatch();

      if (!loaded.success) throw new Error(loaded.error);
    }

    if (!this.activeBatch) return;

    const res = await trpc.runImportBatch.mutate({ id: this.activeBatch.id });

    if (res.error) throw new Error(res.error);

    await this.getImporterStatus();
  });

  @modelFlow
  togglePaused = asyncAction(async () => {
    if (this.isPaused && !this.isImporting) return this.runImporter();

    const res = await (this.isPaused ? trpc.resumeImporter.mutate() : trpc.pauseImporter.mutate());

    if (res.error) throw new Error(res.error);

    await this.getImporterStatus();
  });

  /* --------------------------------- GETTERS -------------------------------- */
  @computed
  get bytesCompleted() {
    if (!this.activeBatch) return 0;

    return this.activeBatch.processedSize;
  }

  @computed
  get bytesTotal() {
    if (!this.activeBatch) return 0;

    return this.activeBatch.size;
  }
}
