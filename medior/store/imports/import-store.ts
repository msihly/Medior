import autoBind from "auto-bind";
import { Model, model, modelAction, ModelCreationData, modelFlow, prop } from "mobx-keystone";
import { asyncAction } from "trabecula/utils/client";
import { dayjs } from "medior/utils/common";
import { trpc } from "medior/utils/server";
import type { SavedImportConfigOptions } from "../saved-import-config";
import {
  getImportConfigMatch,
  normalizeImportConfigPath,
  SavedImportConfig,
  SavedImportConfigSearch,
} from "../saved-import-config";
import { FileImport, FileImportBatch, ImportManager, Ingester, Reingester } from ".";

export type ImportBatchInput = Omit<ModelCreationData<FileImportBatch>, "imports"> & {
  imports?: ModelCreationData<FileImport>[];
};

@model("medior/ImportStore")
export class ImportStore extends Model({
  deletedFileHashes: prop<string[]>(() => []).withSetter(),
  ingester: prop<Ingester>(() => new Ingester({})),
  manager: prop<ImportManager>(() => new ImportManager({})),
  reingester: prop<Reingester>(() => new Reingester({})),
  savedConfigSearch: prop<SavedImportConfigSearch>(() => new SavedImportConfigSearch({})),
  savedConfigs: prop<SavedImportConfig[]>(() => []).withSetter(),
}) {
  onInit() {
    autoBind(this);
  }

  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  addDeletedFileHashes(hashes: string[]) {
    this.deletedFileHashes = [...new Set(...this.deletedFileHashes, ...hashes)];
  }

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  loadDeletedFiles = asyncAction(async () => {
    const res = await trpc.listDeletedFiles.mutate();
    if (res.success) this.deletedFileHashes = res.data.map((f) => f.hash);
  });

  @modelFlow
  loadSavedConfigs = asyncAction(async () => {
    const res = await trpc.listSavedImportConfig.mutate({
      args: { page: 1, pageSize: 1000, sort: { dateModified: "desc" } },
    });
    if (!res.success) throw new Error(res.error);
    this.setSavedConfigs(res.data.items.map((item) => new SavedImportConfig(item)));
    return res.data.items;
  });

  @modelFlow
  deleteSavedConfig = asyncAction(async (id: string) => {
    const res = await trpc.deleteSavedImportConfig.mutate({ args: { ids: [id] } });
    if (!res.success) throw new Error(res.error);
    await this.loadSavedConfigs();
    return res.data;
  });

  @modelFlow
  renameSavedConfig = asyncAction(async ({ id, label }: { id: string; label: string }) => {
    const res = await trpc.updateSavedImportConfig.mutate({
      args: { id, updates: { dateModified: dayjs().toISOString(), label } },
    });
    if (!res.success) throw new Error(res.error);
    await this.loadSavedConfigs();
    return res.data;
  });

  @modelFlow
  saveSavedConfig = asyncAction(
    async ({
      folderPath,
      id,
      label,
      options,
    }: {
      folderPath: string;
      id?: string;
      label: string;
      options: SavedImportConfigOptions;
    }) => {
      const normalizedFolderPath = normalizeImportConfigPath(folderPath);
      const existing = this.savedConfigs.find(
        (config) => config.normalizedFolderPath === normalizedFolderPath,
      );
      const dateModified = dayjs().toISOString();

      if (id || existing) {
        const res = await trpc.updateSavedImportConfig.mutate({
          args: { id: id || existing.id, updates: { dateModified, folderPath, label, options } },
        });
        if (!res.success) throw new Error(res.error);
        await this.loadSavedConfigs();
        return res.data;
      }

      const res = await trpc.createSavedImportConfig.mutate({
        args: { dateCreated: dateModified, dateModified, folderPath, label, options },
      });
      if (!res.success) throw new Error(res.error);
      await this.loadSavedConfigs();
      return res.data;
    },
  );

  /* ----------------------------- DYNAMIC GETTERS ---------------------------- */
  getSavedConfigForFolder(folderPath: string) {
    return this.getSavedConfigMatchForFolder(folderPath)?.config;
  }

  getSavedConfigMatchForFolder(folderPath: string) {
    return getImportConfigMatch(this.savedConfigs, folderPath);
  }
}
