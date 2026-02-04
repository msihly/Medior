import remote from "@electron/remote";
import fs from "fs/promises";
import { Mark } from "@mui/base";
import autoBind from "auto-bind";
import { computed } from "mobx";
import { getRootStore, Model, model, modelAction, modelFlow, prop } from "mobx-keystone";
import { asyncAction, FileImporter, RootStore } from "medior/store";
import { toast } from "medior/utils/client";
import { Fmt } from "medior/utils/common";
import { extractVideoFrame, trpc, videoTranscoder } from "medior/utils/server";

@model("medior/CarouselStore")
export class CarouselStore extends Model({
  activeFileId: prop<string>("").withSetter(),
  curFrame: prop<number>(1),
  curTime: prop<number>(0),
  isMouseMoving: prop<boolean>(false).withSetter(),
  isPinned: prop<boolean>(false).withSetter(),
  isPlaying: prop<boolean>(true).withSetter(),
  isWaitingForFrames: prop<boolean>(false).withSetter(),
  lastVolume: prop<number>(0.3).withSetter(),
  markIn: prop<number>(null).withSetter(),
  markOut: prop<number>(null).withSetter(),
  mediaSourceUrl: prop<string | null>(null).withSetter(),
  playbackRate: prop<number>(1).withSetter(),
  seekOffset: prop<number>(0).withSetter(),
  selectedFileIds: prop<string[]>(() => []).withSetter(),
  volume: prop<number>(0.3).withSetter(),
}) {
  onInit() {
    autoBind(this);
  }

  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  addFileAfterIndex(fileId: string, index: number) {
    this.selectedFileIds.splice(index + 1, 0, fileId);
  }

  @modelAction
  removeFiles(fileIds: string[]) {
    const stores = getRootStore<RootStore>(this);
    const newSelectedIds = this.selectedFileIds.filter((id) => !fileIds.includes(id));
    if (!newSelectedIds.length) return remote.getCurrentWindow().close();

    if (fileIds.includes(this.activeFileId)) {
      const newFileId =
        newSelectedIds[this.activeFileIndex] ?? newSelectedIds[this.activeFileIndex - 1];
      this.setActiveFileId(newFileId);
      stores.file.setActiveFileId(newFileId);
    }

    this.setSelectedFileIds(newSelectedIds);

    stores.file.search.setIds(newSelectedIds);
    stores.file.search.loadFiltered();
  }

  @modelAction
  setCurFrame(frame: number, frameRate: number) {
    this.curFrame = frame;
    this.curTime = Fmt.frameToSec(frame, frameRate);
  }

  @modelAction
  toggleIsPinned() {
    this.setIsPinned(!this.isPinned);
  }

  @modelAction
  toggleIsPlaying() {
    this.setIsPlaying(!this.isPlaying);
  }

  @modelAction
  toggleMute() {
    if (this.volume === 0) this.setVolume(this.lastVolume);
    else {
      this.setLastVolume(this.volume);
      this.setVolume(0);
    }
  }

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  extractFrame = asyncAction(async () => {
    const stores = getRootStore<RootStore>(this);
    const activeFile = this.getActiveFile();
    if (!activeFile) throw new Error("Active file not found");

    this.setIsPlaying(false);
    const filePath = await extractVideoFrame(activeFile.path, this.curFrame);
    if (!filePath) throw new Error("Error extracting frame");

    const { size } = await fs.stat(filePath);

    const importer = new FileImporter({
      deleteOnImport: false,
      ext: "jpg",
      ignorePrevDeleted: false,
      originalName: activeFile.originalName,
      originalPath: filePath,
      size,
      tagIds: activeFile.tagIds,
    });
    const res = await importer.import();
    if (!res.success) throw new Error(res.error);

    await trpc.recalculateTagCounts.mutate({ tagIds: activeFile.tagIds });

    stores.file.addFileAfterIndex(res.file, this.activeFileIndex);
    this.addFileAfterIndex(res.file.id, this.activeFileIndex);
    this.setActiveFileId(res.file.id);

    toast.success("Frame extracted");
  });

  @modelFlow
  transcodeVideo = asyncAction(async (args: { seekTime?: number; onFirstFrames?: () => void }) => {
    const stores = getRootStore<RootStore>(this);
    const activeFile = stores.file.getById(this.activeFileId);
    if (activeFile?.isVideo && !activeFile?.isWebPlayable) {
      this.setIsWaitingForFrames(true);
      const url = await videoTranscoder.transcode(activeFile.path, args?.seekTime, () => {
        this.setIsWaitingForFrames(false);
        args?.onFirstFrames?.();
      });
      if (url) this.setMediaSourceUrl(url);
    } else this.setMediaSourceUrl(null);
  });

  /* --------------------------------- GETTERS -------------------------------- */
  @computed
  get activeFileIndex() {
    return this.getFileIndex(this.activeFileId);
  }

  @computed
  get videoMarks() {
    const marks: Mark[] = [];
    if (this.markIn) marks.push({ value: this.markIn, label: "A" });
    if (this.markOut) marks.push({ value: this.markOut, label: "B" });
    return marks;
  }

  /* ----------------------------- DYNAMIC GETTERS ---------------------------- */
  getActiveFile() {
    const stores = getRootStore<RootStore>(this);
    return stores.file.getById(this.activeFileId);
  }

  getFileIndex(fileId: string) {
    return this.selectedFileIds.indexOf(fileId);
  }
}
