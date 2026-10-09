import path from "path";
import autoBind from "auto-bind";
import { ExtendedModel, model } from "mobx-keystone";
import { _SavedImportConfig, _SavedImportConfigSearch } from "medior/store/_generated";
import { ImportEditorOptions } from "./imports/editor-options";

export type SavedImportConfigMatch = { config: SavedImportConfig; rootFolderPath: string };

@model("medior/SavedImportConfig")
export class SavedImportConfig extends ExtendedModel(_SavedImportConfig, {}) {
  onInit() {
    autoBind(this);
  }

  get normalizedFolderPath() {
    return normalizeImportConfigPath(this.folderPath);
  }

  get rootFolderPath() {
    return getImportConfigRootPath(this.folderPath);
  }
}

@model("medior/SavedImportConfigSearch")
export class SavedImportConfigSearch extends ExtendedModel(_SavedImportConfigSearch, {}) {
  onInit() {
    autoBind(this);
  }
}

export type SavedImportConfigOptions = ReturnType<ImportEditorOptions["toSavedConfig"]>;

export const normalizeImportConfigPath = (folderPath: string) =>
  path
    .normalize(folderPath)
    .replace(/[\\\/]+$/, "")
    .toLowerCase();

export const getImportConfigRootPath = (folderPath: string) => {
  const normalizedPath = path.normalize(folderPath);
  const globIndex = normalizedPath.split(path.sep).findIndex((part) => part === "*");

  return globIndex > -1
    ? normalizedPath.split(path.sep).slice(0, globIndex).join(path.sep)
    : normalizedPath;
};

const isNormalizedPathWithin = (normalizedFolderPath: string, normalizedRootPath: string) =>
  normalizedFolderPath === normalizedRootPath ||
  normalizedFolderPath.startsWith(`${normalizedRootPath}${path.sep}`);

export const getImportConfigMatch = (
  configs: SavedImportConfig[],
  folderPath: string,
): SavedImportConfigMatch => {
  const normalizedFolderPath = normalizeImportConfigPath(folderPath);

  return configs
    .map((config) => ({ config, rootFolderPath: config.rootFolderPath }))
    .filter(({ rootFolderPath }) =>
      isNormalizedPathWithin(normalizedFolderPath, normalizeImportConfigPath(rootFolderPath)),
    )
    .sort((a, b) => b.rootFolderPath.length - a.rootFolderPath.length)[0];
};

/** Root folders of every config, excluding roots already covered by a parent config's root. */
export const getImportConfigRootPaths = (configs: SavedImportConfig[]) => {
  const rootPaths: { normalizedPath: string; rootFolderPath: string }[] = [];

  const sortedRootPaths = configs
    .map(({ rootFolderPath }) => ({
      normalizedPath: normalizeImportConfigPath(rootFolderPath),
      rootFolderPath,
    }))
    .sort((a, b) => a.normalizedPath.localeCompare(b.normalizedPath));

  for (const rootPath of sortedRootPaths) {
    if (
      !rootPaths.some((parent) =>
        isNormalizedPathWithin(rootPath.normalizedPath, parent.normalizedPath),
      )
    )
      rootPaths.push(rootPath);
  }

  return rootPaths.map(({ rootFolderPath }) => rootFolderPath);
};
