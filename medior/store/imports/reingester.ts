import path from "path";
import { computed } from "mobx";
import {
  arrayActions,
  ExtendedModel,
  model,
  modelAction,
  ModelCreationData,
  modelFlow,
  prop,
} from "mobx-keystone";
import { asyncAction, toast } from "medior/utils/client";
import { trpc } from "medior/utils/server";
import { FileImport } from "./file-import";
import { ImportEditorStore } from "./import-editor-store";

@model("medior/Reingester")
export class Reingester extends ExtendedModel(ImportEditorStore, {
  folderFileIds: prop<{ folder: string; fileIds: string[] }[]>(() => []).withSetter(),
  tagIds: prop<string[]>(() => []).withSetter(),
}) {
  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  removeCurFolder() {
    const folderName = this.getCurFolder().folderName;

    arrayActions.shift(this.folderFileIds);
    this.allFlatFolderHierarchy.delete(folderName);
    this.flatFolderHierarchy.delete(folderName);
    this.folderTotalCount = this.allFlatFolderHierarchy.size;
    this.setVisibleFolderPage();
  }

  @modelAction
  reset() {
    super.reset();

    this.folderFileIds = [];
    this.tagIds = [];
  }

  /* ---------------------------- ASYNC ACTIONS ---------------------------- */
  @modelFlow
  loadFolder = asyncAction(async () => {
    if (!this.curFolderFileIds?.length) {
      this.setIsOpen(false);
      return;
    }

    this.setIsInitDone(false);

    const res = await trpc.listFile.mutate({ args: { filter: { id: this.curFolderFileIds } } });
    if (!res.success) throw new Error(res.error);

    const filePathMap = new Map(
      [...res.data.items]
        .sort((a, b) => {
          const lengthDiff =
            a.originalPath.split(path.sep).length - b.originalPath.split(path.sep).length;

          if (lengthDiff !== 0) return lengthDiff;

          return a.originalName.localeCompare(b.originalName);
        })
        .map((f) => [f.originalPath, f]),
    );

    const filePaths = [...filePathMap.keys()];
    const rootFolderPath = path.dirname(filePaths[0]);
    const newIndex = rootFolderPath.split(path.sep).length - 1;
    const curIndex = this.rootFolderIndex;
    const rootIndex = curIndex > 0 && curIndex <= newIndex ? curIndex : newIndex;
    const imports: ModelCreationData<FileImport>[] = [];

    this.setRootFolderPath(rootFolderPath);
    this.setRootFolderIndex(rootIndex);

    for (const original of filePathMap.values()) {
      imports.push({
        dateCreated: original.dateCreated,
        extension: original.ext,
        fileId: original.id,
        name: original.originalName,
        path: original.originalPath,
        size: original.size,
        status: "PENDING",
      });
    }

    this.setImports(imports);
    this.setFilePaths(new Map(filePaths.map((p) => [path.resolve(p), p])));
    this.setIsInitDone(true);
  });

  @modelFlow
  reingest = asyncAction(async () => {
    const fileTagIds: { fileId: string; tagIds: string[] }[] = [];

    for (const imp of this.imports) {
      fileTagIds.push({
        fileId: imp.fileId,
        tagIds: [...new Set([...this.tagIds, ...(imp.tagIds ?? [])])],
      });
    }

    const res = await trpc.reingestFolder.mutate({
      collectionTitle: this.getCurFolder().collectionTitle,
      fileTagIds,
    });
    if (!res.success) throw new Error(res.error);

    this.removeCurFolder();
    await this.loadFolder();
    toast.success("Folder reingested");
  });

  /* --------------------------------- GETTERS -------------------------------- */
  @computed
  get curFolderFileIds() {
    return this.folderFileIds[0]?.fileIds;
  }

  /* ----------------------------- DYNAMIC GETTERS ---------------------------- */
  getCurFolder() {
    return this.flatFolderHierarchy.size > 0 ? [...this.flatFolderHierarchy.values()][0] : null;
  }
}
