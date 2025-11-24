import autoBind from "auto-bind";
import { reaction } from "mobx";
import { Model, model, modelAction, modelFlow, prop } from "mobx-keystone";
import { CreateImportBatchesInput, ImportStats } from "medior/server/database";
import { asyncAction } from "medior/store/utils";
import { trpc } from "medior/utils/server";
import { FileImport, FileImportBatch, FileImportBatchSearch } from ".";

const DEFAULT_IMPORT_STATS: ImportStats = {
  completedBytes: 0,
  filePath: "",
  totalBytes: 0,
};

@model("medior/ImportManager")
export class ImportManager extends Model({
  activeBatch: prop<FileImportBatch>(null).withSetter(),
  importStats: prop<ImportStats>(() => DEFAULT_IMPORT_STATS).withSetter(),
  isImporting: prop<boolean>(false).withSetter(),
  isLoading: prop<boolean>(false).withSetter(),
  isOpen: prop<boolean>(false).withSetter(),
  isPaused: prop<boolean>(false).withSetter(),
  search: prop<FileImportBatchSearch>(() => new FileImportBatchSearch({})),
}) {
  onInit() {
    autoBind(this);
    reaction(
      () => this.isOpen,
      () => {
        if (!this.isOpen) this.reset();
        else {
          this.search.loadFiltered({ page: 1 });
          this.runImporter();
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
    this.setActiveBatch(null);
    this.setImportStats(DEFAULT_IMPORT_STATS);
    this.setIsLoading(false);
    this.search.reset();
  }

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  createImportBatches = asyncAction(async (batches: CreateImportBatchesInput) => {
    const batchRes = await trpc.createImportBatches.mutate(
      batches.map((b) => ({
        ...b,
        tagIds: b.tagIds ? [...new Set(b.tagIds)].flat() : [],
      })),
    );
    if (!batchRes.success) throw new Error(batchRes?.error);

    this.runImporter();
  });

  @modelFlow
  deleteBatch = asyncAction(async (args: { id: string }) => {
    await this.pauseImporter();
    const deleteRes = await trpc.deleteImportBatches.mutate({ ids: [args.id] });
    if (!deleteRes.success) throw new Error(deleteRes.error);
    this._deleteBatch(args.id);
    this.runImporter();
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
    this.setIsLoading(true);

    const batchRes = await trpc.getNextImportBatch.mutate();
    if (!batchRes.success) throw new Error(batchRes.error);
    const batch = batchRes.data;
    if (!batch) {
      this.setActiveBatch(null);
      this.setIsLoading(false);
      return null;
    }

    const tagIds = [
      ...new Set([...batch.tagIds, ...batch.imports.map((imp) => imp.tagIds)].flat()),
    ];
    const tagRes = await trpc.listTag.mutate({ args: { filter: { id: tagIds } } });
    const tags = tagRes.data.items;

    this.setActiveBatch(
      new FileImportBatch({
        ...batch,
        imports: batch.imports.map((imp) => new FileImport(imp)),
        tags,
      }),
    );

    this.setIsLoading(false);
    return batch;
  });

  @modelFlow
  pauseImporter = asyncAction(async () => {
    const res = await trpc.pauseImporter.mutate();
    if (res.error) throw new Error(res.error);
    this.getImporterStatus();
  });

  @modelFlow
  runImporter = asyncAction(async () => {
    const id = this.activeBatch?.id || (await this.loadActiveBatch()).data?.id;
    if (!id) return;

    const res = await trpc.runImportBatch.mutate({ id });
    if (res.error) throw new Error(res.error);
    this.getImporterStatus();
  });

  @modelFlow
  togglePaused = asyncAction(async () => {
    const res = await (this.isPaused ? trpc.resumeImporter.mutate() : trpc.pauseImporter.mutate());
    if (res.error) throw new Error(res.error);
    this.getImporterStatus();
  });
}
