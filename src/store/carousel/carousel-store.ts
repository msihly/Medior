import remote from "@electron/remote";
import fs from "fs/promises";
import { computed } from "mobx";
import {
  Model,
  _async,
  _await,
  getRootStore,
  model,
  modelAction,
  modelFlow,
  prop,
} from "mobx-keystone";
import { toast } from "react-toastify";
import { FileImport, RootStore, copyFileForImport } from "store";
import { dayjs, extractVideoFrame, getConfig, handleErrors, trpc } from "utils";

@model("medior/CarouselStore")
export class CarouselStore extends Model({
  activeFileId: prop<string>("").withSetter(),
  curFrame: prop<number>(1).withSetter(),
  isMouseMoving: prop<boolean>(false).withSetter(),
  isPlaying: prop<boolean>(true).withSetter(),
  selectedFileIds: prop<string[]>(() => []).withSetter(),
}) {
  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  addFileAfterIndex(fileId: string, index: number) {
    this.selectedFileIds.splice(index + 1, 0, fileId);
  }

  @modelAction
  removeFiles(fileIds: string[]) {
    const newSelectedIds = this.selectedFileIds.filter((id) => !fileIds.includes(id));
    if (!newSelectedIds.length) return remote.getCurrentWindow().close();

    if (fileIds.includes(this.activeFileId))
      this.setActiveFileId(
        newSelectedIds[this.activeFileIndex] ?? newSelectedIds[this.activeFileIndex - 1]
      );

    this.setSelectedFileIds(newSelectedIds);

    const rootStore = getRootStore<RootStore>(this);
    if (!rootStore) return;
    rootStore.fileStore.loadFiles({ fileIds: newSelectedIds });
  }

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  extractFrame = _async(function* (this: CarouselStore) {
    return yield* _await(
      handleErrors(async () => {
        const rootStore = getRootStore<RootStore>(this);
        const activeFile = rootStore.fileStore.getById(this.activeFileId);
        if (!activeFile) throw new Error("Active file not found");

        this.setIsPlaying(false);
        const filePath = await extractVideoFrame(activeFile.path, this.curFrame);
        if (!filePath) throw new Error("Error extracting frame");

        const { size } = await fs.stat(filePath);

        const copyRes = await copyFileForImport({
          deleteOnImport: false,
          fileImport: new FileImport({
            dateCreated: dayjs().toISOString(),
            extension: ".jpg",
            name: activeFile.originalName,
            path: filePath,
            size,
            status: "PENDING",
          }),
          ignorePrevDeleted: false,
          targetDir: getConfig().mongo.outputDir,
          tagIds: activeFile.tagIds,
          tagIdsWithAncestors: activeFile.tagIdsWithAncestors,
        });
        if (!copyRes.success) throw new Error(copyRes.error);

        await trpc.recalculateTagCounts.mutate({ tagIds: activeFile.tagIds });

        rootStore.fileStore.addFileAfterIndex(copyRes.file, this.activeFileIndex);
        this.addFileAfterIndex(copyRes.file.id, this.activeFileIndex);
        this.setActiveFileId(copyRes.file.id);

        toast.success("Frame extracted");
      })
    );
  });

  /* --------------------------------- GETTERS -------------------------------- */
  @computed
  get activeFileIndex() {
    return this.getFileIndex(this.activeFileId);
  }

  /* ----------------------------- DYNAMIC GETTERS ---------------------------- */
  getFileIndex = (fileId: string) => this.selectedFileIds.indexOf(fileId);
}
