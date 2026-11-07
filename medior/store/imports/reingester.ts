import path from "path";
import {
  ExtendedModel,
  model,
  modelAction,
  ModelCreationData,
  modelFlow,
  prop,
} from "mobx-keystone";
import { asyncAction } from "medior/utils/client";
import { chunkArray, MediaProgramImport, sumArray } from "medior/utils/common";
import { rpc } from "medior/utils/server";
import { getCommonSourceFolder } from "medior/utils/server/source-folders";
import { FileImport } from "./file-import";
import { ImportEditorStore } from "./import-editor-store";

@model("medior/Reingester")
export class Reingester extends ExtendedModel(ImportEditorStore, {
  fileIds: prop<string[]>(() => []).withSetter(),
}) {
  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  removeFolder(folderName: string) {
    const folder = this.allFlatFolderHierarchy.get(folderName);
    if (!folder) return;

    this.allFlatFolderHierarchy.delete(folderName);
    this.folderTotalCount = this.allFlatFolderHierarchy.size;
    this.importCount -= folder.imports.length;
    this.importSize -= sumArray(folder.imports, (imp) => imp.size);
    this.setVisibleFolderPage();
  }

  @modelAction
  reset() {
    super.reset();

    this.fileIds = [];
  }

  /* ---------------------------- ASYNC ACTIONS ---------------------------- */
  /**
   * Loads every selected file at once, rooted at the folder they share, so programs and their
   * seasons are detected across folders.
   */
  @modelFlow
  loadFiles = asyncAction(async () => {
    const cancelToken = this.ingestCancelToken;
    const files: Awaited<ReturnType<typeof rpc.listFileReingestMetadata>>["data"] = [];

    this.setIsInitDone(false);

    for (const fileIds of chunkArray(this.fileIds, 1000)) {
      const res = await rpc.listFileReingestMetadata({ fileIds });

      if (cancelToken !== this.ingestCancelToken) return;

      if (!res.success) throw new Error(res.error);

      files.push(...res.data);
    }

    if (!files.length) {
      this.setIsOpen(false);

      return;
    }

    files.sort((a, b) => {
      const lengthDiff =
        a.originalPath.split(path.sep).length - b.originalPath.split(path.sep).length;

      return lengthDiff || a.originalName.localeCompare(b.originalName);
    });

    const filePaths = files.map((file) => file.originalPath);
    // Files sharing no folder below their drive root start from the shallowest file's folder.
    const rootFolderPath = getCommonSourceFolder(filePaths) ?? path.dirname(filePaths[0]);
    const rootFolderIndex = rootFolderPath.split(path.sep).length - 1;
    const imports: ModelCreationData<FileImport>[] = [];

    this.setRootFolderPath(rootFolderPath);
    this.setRootFolderIndex(rootFolderIndex);
    this.setSourceRootIndex(rootFolderIndex);

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

  /** Adds the folder's tags to its files, then adds them to its program season or collection. */
  @modelFlow
  reingestFolder = asyncAction(
    async (args: {
      collectionTitle: string;
      fileTagIds: { fileId: string; tagIds: string[] }[];
      mediaProgram: MediaProgramImport;
    }) => {
      const res = await rpc.reingestFolder(args);
      if (!res.success) throw new Error(res.error);
    },
  );
}
