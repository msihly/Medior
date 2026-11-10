import autoBind from "auto-bind";
import { Model, model, modelFlow, prop } from "mobx-keystone";
import { asyncAction } from "medior/utils/client";
import { dayjs } from "medior/utils/common";
import { rpc } from "medior/utils/server";
import type { SavedImportConfigOptions } from "../saved-import-config";
import {
  getImportConfigMatch,
  normalizeImportConfigPath,
  SavedImportConfig,
  SavedImportConfigSearch,
} from "../saved-import-config";
import { ImportEditorStore, ImportManager } from ".";

@model("medior/ImportStore")
export class ImportStore extends Model({
  /** The Ingester, which also reingests library files. */
  editor: prop<ImportEditorStore>(() => new ImportEditorStore({})),
  manager: prop<ImportManager>(() => new ImportManager({})),
  savedConfigs: prop<SavedImportConfig[]>(() => []).withSetter(),
  savedConfigSearch: prop<SavedImportConfigSearch>(() => new SavedImportConfigSearch({})),
}) {
  onInit() {
    autoBind(this);
  }

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  deleteSavedConfig = asyncAction(async (id: string) => {
    const res = await rpc.deleteSavedImportConfig({ args: { ids: [id] } });

    if (!res.success) throw new Error(res.error);

    await this.loadSavedConfigs();

    return res.data;
  });

  @modelFlow
  loadSavedConfigs = asyncAction(async () => {
    const res = await rpc.listSavedImportConfig({
      args: { page: 1, pageSize: 1000, sort: { dateModified: "desc" } },
    });

    if (!res.success) throw new Error(res.error);

    this.setSavedConfigs(res.data.items.map((item) => new SavedImportConfig(item)));

    return res.data.items;
  });

  @modelFlow
  renameSavedConfig = asyncAction(async ({ id, label }: { id: string; label: string }) => {
    const res = await rpc.updateSavedImportConfig({
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

      const res =
        id || existing
          ? await rpc.updateSavedImportConfig({
              args: {
                id: id || existing.id,
                updates: { dateModified, folderPath, label, options },
              },
            })
          : await rpc.createSavedImportConfig({
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
