import autoBind from "auto-bind";
import type { FileImportBatchSchema, SocketEvents } from "medior/_generated/server";
import { computed } from "mobx";
import {
  applySnapshot,
  ExtendedModel,
  getSnapshot,
  model,
  modelAction,
  modelFlow,
  prop,
} from "mobx-keystone";
import { _FileImportBatch } from "medior/store/_generated";
import type { ImportStatus } from "medior/server/database";
import type { TagToUpsert } from "medior/components";
import { asyncAction } from "medior/utils/client";
import { IMPORT_PAGE_SIZE } from "medior/utils/common";
import { trpc } from "medior/utils/server";
import { FileImport } from ".";

type ImportUpdate = Parameters<SocketEvents["onFileImportUpdated"]>[0];

@model("medior/FileImportBatch")
export class FileImportBatch extends ExtendedModel(_FileImportBatch, {
  imports: prop<FileImport[]>(() => []).withSetter(),
  isLoadingEntries: prop<boolean>(false).withSetter(),
  loadError: prop<string>(null).withSetter(),
  page: prop<number>(1).withSetter(),
  statusCounts: prop<Partial<Record<ImportStatus, number>>>(() => ({})).withSetter(),
  statuses: prop<ImportStatus[]>(() => []).withSetter(),
  tags: prop<TagToUpsert[]>(() => []).withSetter(),
}) {
  private loadRevision = 0;
  private pendingUpdates = new Map<string, ImportUpdate>();
  private statusCountsRevision = 0;
  private statusCountsTimer: ReturnType<typeof setTimeout> = null;

  onInit() {
    autoBind(this);
  }

  /** Imports in progress refresh the counts at most once per second. */
  queueStatusCounts() {
    if (this.statusCountsTimer) return;

    this.statusCountsTimer = setTimeout(() => {
      this.statusCountsTimer = null;
      this.loadStatusCounts();
    }, 1000);
  }

  @modelAction
  toggleStatus(status: ImportStatus) {
    this.statuses = this.statuses.includes(status)
      ? this.statuses.filter((cur) => cur !== status)
      : [...this.statuses, status];
  }

  @modelAction
  updateHeader(batch: FileImportBatchSchema) {
    applySnapshot(this, {
      ...getSnapshot(this),
      ...batch,
      ...(batch.progressRevision < this.progressRevision
        ? {
            processedCount: this.processedCount,
            processedSize: this.processedSize,
            progressRevision: this.progressRevision,
          }
        : {}),
    });

    this.queueStatusCounts();
  }

  @modelAction
  updateImport(update: ImportUpdate) {
    if (update.progressRevision >= this.progressRevision) {
      this.processedCount = update.processedCount;
      this.processedSize = update.processedSize;
      this.progressRevision = update.progressRevision;
    }

    if (update.status !== undefined) this.queueStatusCounts();

    if (
      this.isLoadingEntries &&
      update.progressRevision >= (this.pendingUpdates.get(update.filePath)?.progressRevision ?? -1)
    )
      this.pendingUpdates.set(update.filePath, update);

    for (const entry of this.entriesByPath.get(update.filePath) ?? []) {
      if (update.progressRevision >= entry.progressRevision) {
        entry.update({
          ...(update.errorMsg !== undefined ? { errorMsg: update.errorMsg } : {}),
          ...(update.fileId !== undefined ? { fileId: update.fileId } : {}),
          progressRevision: update.progressRevision,
          ...(update.status !== undefined ? { status: update.status } : {}),
        });
      }
    }
  }

  @modelFlow
  loadPage = asyncAction(async (page: number = this.page) => {
    const revision = ++this.loadRevision;

    this.pendingUpdates.clear();
    this.setIsLoadingEntries(true);
    this.setLoadError(null);

    try {
      const result = await trpc.getImportBatchEntries.mutate({
        id: this.id,
        page,
        statuses: this.statuses,
      });

      if (!result.success) throw new Error(result.error);

      if (revision === this.loadRevision) {
        this.setImports(result.data.map((entry) => new FileImport(entry)));
        this.setPage(page);
        this.setIsLoadingEntries(false);

        for (const update of this.pendingUpdates.values()) this.updateImport(update);

        this.pendingUpdates.clear();
      }
    } catch (error) {
      if (revision === this.loadRevision) this.setLoadError(error.message);

      throw error;
    } finally {
      if (revision === this.loadRevision) this.setIsLoadingEntries(false);
    }
  });

  @modelFlow
  loadStatusCounts = asyncAction(async () => {
    const revision = ++this.statusCountsRevision;

    const result = await trpc.getImportBatchStatusCounts.mutate({ id: this.id });
    if (!result.success) throw new Error(result.error);

    if (revision === this.statusCountsRevision) this.setStatusCounts(result.data);
  });

  @computed
  get entriesByPath() {
    const entries = new Map<string, FileImport[]>();

    for (const entry of this.imports) {
      const matches = entries.get(entry.path) ?? [];

      matches.push(entry);
      entries.set(entry.path, matches);
    }

    return entries;
  }

  @computed
  get pageCount() {
    const count = this.statuses.length
      ? this.statuses.reduce((total, status) => total + (this.statusCounts[status] ?? 0), 0)
      : this.fileCount;

    return Math.max(1, Math.ceil(count / IMPORT_PAGE_SIZE));
  }
}
