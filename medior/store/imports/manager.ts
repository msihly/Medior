import autoBind from "auto-bind";
import { computed, reaction } from "mobx";
import { Model, model, modelAction, modelFlow, prop } from "mobx-keystone";
import { asyncAction } from "trabecula/utils/client";
import { CreateImportBatchesInput } from "medior/server/database";
import { sumArray } from "medior/utils/common";
import { trpc } from "medior/utils/server";
import { FileImport, FileImportBatch, FileImportBatchSearch } from ".";

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
          this.loadActiveBatch();
          this.search.loadFiltered({ page: 1 });
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
      onProgress,
    }: {
      batches: CreateImportBatchesInput;
      onProgress?: (completed: number, total: number) => void;
    }) => {
      const ids: string[] = [];
      const total = batches.reduce((count, batch) => count + batch.imports.length, 0);
      let completed = 0;

      for (const batch of batches) {
        const tagIds = [...new Set(batch.tagIds ?? [])];
        let imports: typeof batch.imports = [];
        let bytes = 0;

        const flush = async () => {
          if (!imports.length) return;

          onProgress?.(completed, total);

          const res = await trpc.createImportBatches.mutate([{ ...batch, imports, tagIds }]);
          if (!res.success)
            throw new Error(`Queued ${completed} of ${total} files before failure: ${res.error}`);

          ids.push(...res.data.ids);
          completed += imports.length;
          imports = [];
          bytes = 0;
          onProgress?.(completed, total);
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        };
        // Keep each embedded batch and transport payload bounded, including large diffusion prompts.
        for (const imp of batch.imports) {
          const size = Buffer.byteLength(JSON.stringify(imp), "utf8");
          if (imports.length >= 1000 || bytes + size > 4 * 1024 * 1024) await flush();

          imports.push(imp);
          bytes += size;
        }

        await flush();
      }

      return { count: ids.length, ids };
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

        return null;
      }

      this.setActiveBatch(
        new FileImportBatch({
          ...batch,
          imports: batch.imports.map((imp) => {
            const current =
              this.activeBatch?.id === batch.id ? this.activeBatch.getByPath(imp.path) : null;

            return new FileImport(
              current && imp.status === "PENDING" && current.status !== "PENDING"
                ? {
                    ...imp,
                    errorMsg: current.errorMsg,
                    fileId: current.fileId,
                    status: current.status,
                  }
                : imp,
            );
          }),
        }),
      );

      const tagIds = [
        ...new Set([...batch.tagIds, ...batch.imports.map((imp) => imp.tagIds)].flat()),
      ];

      const tagRes = await trpc.listTag.mutate({ filter: { id: tagIds } });
      if (!tagRes.success) throw new Error(tagRes.error);

      if (revision === this.activeBatchLoadRevision && this.activeBatch?.id === batch.id)
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

    return sumArray(this.activeBatch.imported, (imp) => imp.size);
  }

  @computed
  get bytesTotal() {
    if (!this.activeBatch) return 0;

    return sumArray(this.activeBatch.imports, (imp) => imp.size);
  }
}
