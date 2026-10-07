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
import { chunkArray } from "medior/utils/common";
import { trpc } from "medior/utils/server";
import { FileImport } from "./file-import";
import { ImportEditorStore } from "./import-editor-store";

@model("medior/Reingester")
export class Reingester extends ExtendedModel(ImportEditorStore, {
  folderFileIds: prop<{ fileIds: string[]; folder: string }[]>(() => []).withSetter(),
  tagIds: prop<string[]>(() => []).withSetter(),
}) {
  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  removeCurFolder() {
    const folderName = this.getCurFolder().folderName;

    arrayActions.shift(this.folderFileIds);
    this.allFlatFolderHierarchy.delete(folderName);
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
    const cancelToken = this.ingestCancelToken;
    const files: Awaited<ReturnType<typeof trpc.listFileReingestMetadata.mutate>>["data"] = [];

    this.setIsInitDone(false);

    while (this.folderFileIds.length && !files.length) {
      for (const fileIds of chunkArray(this.curFolderFileIds, 1000)) {
        const res = await trpc.listFileReingestMetadata.mutate({ fileIds });

        if (cancelToken !== this.ingestCancelToken) return;

        if (!res.success) throw new Error(res.error);

        files.push(...res.data);
      }

      if (!files.length) arrayActions.shift(this.folderFileIds);
    }

    if (!files.length) {
      this.setIsOpen(false);

      return;
    }

    files.sort((a, b) => {
      const lengthDiff =
        a.originalPath.split(path.sep).length - b.originalPath.split(path.sep).length;

      if (lengthDiff !== 0) return lengthDiff;

      return a.originalName.localeCompare(b.originalName);
    });

    const filePaths = files.map((file) => file.originalPath);
    const rootFolderPath = path.dirname(filePaths[0]);
    const newIndex = rootFolderPath.split(path.sep).length - 1;
    const curIndex = this.rootFolderIndex;
    const rootIndex = curIndex > 0 && curIndex <= newIndex ? curIndex : newIndex;
    const imports: ModelCreationData<FileImport>[] = [];

    this.setRootFolderPath(rootFolderPath);
    this.setRootFolderIndex(rootIndex);

    for (const original of files) {
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

    for (const imp of this.getCurFolder().imports) {
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
