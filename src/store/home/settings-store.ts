import { applySnapshot, getSnapshot, Model, model, modelAction, prop } from "mobx-keystone";
import { Config, ConfigKey, convertNestedKeys, DEFAULT_CONFIG } from "utils";

@model("medior/SettingsStore")
export class SettingsStore extends Model({
  collection: prop<Config["collection"]>(() => DEFAULT_CONFIG.collection),
  db: prop<Config["db"]>(() => DEFAULT_CONFIG.db),
  file: prop<Config["file"]>(() => DEFAULT_CONFIG.file),
  hasUnsavedChanges: prop<boolean>(false).withSetter(),
  imports: prop<Config["imports"]>(() => DEFAULT_CONFIG.imports),
  isLoading: prop<boolean>(false).withSetter(),
  isOpen: prop<boolean>(false).withSetter(),
  ports: prop<Config["ports"]>(() => DEFAULT_CONFIG.ports),
  tags: prop<Config["tags"]>(() => DEFAULT_CONFIG.tags),
}) {
  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  addFileStorageLocation(location: string) {
    this.db.fileStorage.locations.push(location);
  }

  @modelAction
  removeFileStorageLocation(index: number) {
    this.db.fileStorage.locations.splice(index, 1);
  }

  @modelAction
  setDbPath(value: Config["db"]["path"]) {
    this.db.path = value;
  }

  @modelAction
  setFileCardFit(value: Config["file"]["fileCardFit"]) {
    this.file.fileCardFit = value;
  }

  @modelAction
  setFileStorageIndex(index: number, newIndex: number) {
    const locations = [...this.db.fileStorage.locations];
    const prevAtIndex = locations[index];
    const prevAtNewIndex = locations[newIndex];
    console.log({ prevAtIndex, prevAtNewIndex });
    locations[index] = prevAtNewIndex;
    locations[newIndex] = prevAtIndex;
    this.db.fileStorage.locations = locations;
  }

  @modelAction
  setFileStorageLocation(index: number, location: string) {
    this.db.fileStorage.locations[index] = location;
  }

  @modelAction
  setFolderToCollMode(value: Config["imports"]["folderToCollMode"]) {
    this.imports.folderToCollMode = value;
  }

  @modelAction
  setFolderToTagsMode(value: Config["imports"]["folderToTagsMode"]) {
    this.imports.folderToTagsMode = value;
  }

  @modelAction
  toggleFolderToCollMode() {
    this.imports.folderToCollMode =
      this.imports.folderToCollMode === "withTag" ? "withoutTag" : "withTag";
  }

  @modelAction
  update(
    updates: Partial<{
      collection: Partial<Config["collection"]>;
      file: Partial<Config["file"]>;
      imports: Partial<Config["imports"]>;
      db: Partial<Config["db"]>;
      ports: Partial<Config["ports"]>;
      tags: Partial<Config["tags"]>;
    }>
  ) {
    const nestedUpdates = convertNestedKeys(updates);

    const snapshot = {
      ...getSnapshot(this),
      collection: { ...getSnapshot(this.collection), ...nestedUpdates.collection },
      file: { ...getSnapshot(this.file), ...nestedUpdates.file },
      imports: { ...getSnapshot(this.imports), ...nestedUpdates.imports },
      db: { ...getSnapshot(this.db), ...nestedUpdates.db },
      ports: { ...getSnapshot(this.ports), ...nestedUpdates.ports },
      tags: { ...getSnapshot(this.tags), ...nestedUpdates.tags },
    };

    applySnapshot(this, snapshot);
  }

  /* ----------------------------- DYNAMIC GETTERS ---------------------------- */
  getConfig() {
    return {
      collection: getSnapshot(this.collection),
      file: getSnapshot(this.file),
      imports: getSnapshot(this.imports),
      db: getSnapshot(this.db),
      ports: getSnapshot(this.ports),
      tags: getSnapshot(this.tags),
    };
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