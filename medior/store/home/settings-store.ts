import autoBind from "auto-bind";
import { applySnapshot, getSnapshot, Model, model, modelAction, prop } from "mobx-keystone";
import { Config, ConfigKey, DEFAULT_CONFIG } from "medior/utils/client";
import { convertNestedKeys, deepMerge } from "medior/utils/common";

@model("medior/SettingsStore")
export class SettingsStore extends Model({
  collection: prop<Config["collection"]>(() => DEFAULT_CONFIG.collection),
  dev: prop<Config["dev"]>(() => DEFAULT_CONFIG.dev),
  db: prop<Config["db"]>(() => DEFAULT_CONFIG.db),
  file: prop<Config["file"]>(() => DEFAULT_CONFIG.file),
  hasUnsavedChanges: prop<boolean>(false).withSetter(),
  imports: prop<Config["imports"]>(() => DEFAULT_CONFIG.imports),
  isLoading: prop<boolean>(false).withSetter(),
  isOpen: prop<boolean>(false).withSetter(),
  isRepairOpen: prop<boolean>(false).withSetter(),
  ports: prop<Config["ports"]>(() => DEFAULT_CONFIG.ports),
  tags: prop<Config["tags"]>(() => DEFAULT_CONFIG.tags),
}) {
  onInit() {
    autoBind(this);
  }

  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  addFileStorageLocation(location: string) {
    this.db.fileStorage.locations.push(location);
    this.setHasUnsavedChanges(true);
  }

  @modelAction
  removeFileStorageLocation(index: number) {
    this.db.fileStorage.locations.splice(index, 1);
    this.setHasUnsavedChanges(true);
  }

  @modelAction
  setDbPath(value: Config["db"]["path"]) {
    this.db.path = value;
    this.setHasUnsavedChanges(true);
  }

  @modelAction
  setFileCardFit(value: Config["file"]["fileCardFit"]) {
    this.file.fileCardFit = value;
    this.setHasUnsavedChanges(true);
  }

  @modelAction
  setFileStorageIndex(index: number, newIndex: number) {
    const locations = [...this.db.fileStorage.locations];
    const prevAtIndex = locations[index];
    const prevAtNewIndex = locations[newIndex];
    locations[index] = prevAtNewIndex;
    locations[newIndex] = prevAtIndex;
    this.db.fileStorage.locations = locations;
    this.setHasUnsavedChanges(true);
  }

  @modelAction
  setFileStorageLocation(index: number, location: string) {
    this.db.fileStorage.locations[index] = location;
    this.setHasUnsavedChanges(true);
  }

  @modelAction
  setFolderToCollMode(value: Config["imports"]["folderToCollMode"]) {
    this.imports.folderToCollMode = value;
    this.setHasUnsavedChanges(true);
  }

  @modelAction
  setFolderToTagsMode(value: Config["imports"]["folderToTagsMode"]) {
    this.imports.folderToTagsMode = value;
    this.setHasUnsavedChanges(true);
  }

  @modelAction
  toggleFolderToCollMode() {
    this.imports.folderToCollMode =
      this.imports.folderToCollMode === "withTag" ? "withoutTag" : "withTag";
    this.setHasUnsavedChanges(true);
  }

  @modelAction
  update(
    updates: Partial<{
      collection: Partial<Config["collection"]>;
      dev: Partial<Config["dev"]>;
      file: Partial<Config["file"]>;
      imports: Partial<Config["imports"]>;
      db: Partial<Config["db"]>;
      ports: Partial<Config["ports"]>;
      tags: Partial<Config["tags"]>;
    }>,
  ) {
    const nestedUpdates = convertNestedKeys(updates);
    const snapshot = deepMerge(getSnapshot(this), nestedUpdates);
    applySnapshot(this, snapshot);
    this.setHasUnsavedChanges(true);
  }

  /* ----------------------------- DYNAMIC GETTERS ---------------------------- */
  getConfig() {
    return {
      collection: getSnapshot(this.collection),
      dev: getSnapshot(this.dev),
      file: getSnapshot(this.file),
      imports: getSnapshot(this.imports),
      db: getSnapshot(this.db),
      ports: getSnapshot(this.ports),
      tags: getSnapshot(this.tags),
    } as Config;
  }

  getConfigByKey<T>(key: ConfigKey): T {
    let result = this.getConfig();
    for (const k of key.split(".")) {
      if (result && typeof result === "object") result = result[k];
      else return undefined;
    }
    return result as T;
  }
}
