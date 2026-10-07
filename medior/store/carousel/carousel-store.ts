import remote from "@electron/remote";
import fs from "fs/promises";
import { Mark } from "@mui/base";
import autoBind from "auto-bind";
import { computed } from "mobx";
import { getRootStore, Model, model, modelAction, modelFlow, prop } from "mobx-keystone";
import type { ImageEditInput } from "medior/server/database/actions/image-edits";
import { RootStore, Splicer } from "medior/store";
import { asyncAction, derefMobx, openCarouselWindow, toast } from "medior/utils/client";
import { Fmt } from "medior/utils/common";
import { trpc } from "medior/utils/server";
import { extractVideoFrame, videoTranscoder } from "medior/utils/server/videos";

const CAPTIONS_VISIBLE_KEY = "medior.carousel.captionsVisible";
const IS_PINNED_KEY = "medior.carousel.isPinned";
const LAST_VOLUME_KEY = "medior.carousel.lastVolume";
const VOLUME_KEY = "medior.carousel.volume";
const WAVEFORM_VISIBLE_KEY = "medior.carousel.waveformVisible";

@model("medior/CarouselStore")
export class CarouselStore extends Model({
  activeFileId: prop<string>("").withSetter(),
  curFrame: prop<number>(1),
  curTime: prop<number>(0),
  isCaptionsVisible: prop<boolean>(false),
  isEditingImage: prop<boolean>(false).withSetter(),
  isExtractingFrame: prop<boolean>(false).withSetter(),
  isMouseMoving: prop<boolean>(false).withSetter(),
  isPinned: prop<boolean>(false).withSetter(),
  isPlaying: prop<boolean>(true).withSetter(),
  isSavingFrame: prop<boolean>(false).withSetter(),
  isWaitingForFrames: prop<boolean>(false).withSetter(),
  isWaveformVisible: prop<boolean>(true),
  lastVolume: prop<number>(0.3).withSetter(),
  markIn: prop<number>(null).withSetter(),
  markOut: prop<number>(null).withSetter(),
  mediaSourceUrl: prop<string | null>(null).withSetter(),
  playbackRate: prop<number>(1).withSetter(),
  seekOffset: prop<number>(0).withSetter(),
  selectedFileIds: prop<string[]>(() => []).withSetter(),
  splicer: prop<Splicer>(() => new Splicer({})).withSetter(),
  transcodeBitrate: prop<number>(6).withSetter(),
  transcodingFileId: prop<string>("").withSetter(),
  visibleFileIds: prop<string[]>(() => []).withSetter(),
  volume: prop<number>(0.3).withSetter(),
}) {
  private frameAbortController: AbortController = null;

  onInit() {
    autoBind(this);

    const captionsVisible = localStorage.getItem(CAPTIONS_VISIBLE_KEY);
    const isPinned = localStorage.getItem(IS_PINNED_KEY);
    const lastVolume = localStorage.getItem(LAST_VOLUME_KEY);
    const volume = localStorage.getItem(VOLUME_KEY);
    const waveformVisible = localStorage.getItem(WAVEFORM_VISIBLE_KEY);

    if (captionsVisible !== null) this.isCaptionsVisible = captionsVisible === "true";

    if (isPinned !== null) this.isPinned = isPinned === "true";

    if (lastVolume !== null && Number.isFinite(Number(lastVolume)))
      this.lastVolume = Number(lastVolume);

    if (volume !== null && Number.isFinite(Number(volume))) this.volume = Number(volume);

    if (waveformVisible !== null) this.isWaveformVisible = waveformVisible === "true";
  }

  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  cancelFrameExtraction() {
    if (!this.isSavingFrame) this.frameAbortController?.abort();
  }

  @modelAction
  handleTranscodeError(error: unknown) {
    this.setIsWaitingForFrames(false);
    this.setIsPlaying(false);
    this.setMediaSourceUrl(null);
    toast.error(error);
  }

  @modelAction
  addFileAfterIndex(fileId: string, index: number) {
    this.selectedFileIds.splice(index + 1, 0, fileId);
  }

  @modelAction
  removeFiles(fileIds: string[]) {
    const stores = getRootStore<RootStore>(this);

    const removedIds = new Set(fileIds);
    const newSelectedIds = this.selectedFileIds.filter((id) => !removedIds.has(id));

    if (!newSelectedIds.length) {
      if (!stores.collection.manager.isTriagerOpen) return remote.getCurrentWindow().close();

      this.setActiveFileId("");
      this.setSelectedFileIds([]);
      stores.file.setActiveFileId("");
      stores.file.search.setIds([]);
      stores.file.search.setResults([]);

      return;
    }

    if (fileIds.includes(this.activeFileId)) {
      const newFileId =
        newSelectedIds[Math.max(0, Math.min(this.activeFileIndex, newSelectedIds.length - 1))];

      this.setActiveFileId(newFileId);
      stores.file.setActiveFileId(newFileId);
    }

    this.setSelectedFileIds(newSelectedIds);

    this.loadFiles();
  }

  @modelAction
  setCurFrame(frame: number, frameRate: number) {
    this.curFrame = frame;
    this.curTime = Fmt.frameToSec(frame, frameRate);
  }

  @modelAction
  setVolumePreference(volume: number) {
    this.setLastVolume(volume);
    this.setVolume(volume);
    localStorage.setItem(LAST_VOLUME_KEY, String(this.lastVolume));
    localStorage.setItem(VOLUME_KEY, String(this.volume));
  }

  @modelAction
  toggleCaptions() {
    this.isCaptionsVisible = !this.isCaptionsVisible;
    localStorage.setItem(CAPTIONS_VISIBLE_KEY, String(this.isCaptionsVisible));
  }

  @modelAction
  toggleIsPinned() {
    this.setIsPinned(!this.isPinned);
    localStorage.setItem(IS_PINNED_KEY, String(this.isPinned));
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

    localStorage.setItem(LAST_VOLUME_KEY, String(this.lastVolume));
    localStorage.setItem(VOLUME_KEY, String(this.volume));
  }

  @modelAction
  toggleWaveform() {
    this.isWaveformVisible = !this.isWaveformVisible;
    localStorage.setItem(WAVEFORM_VISIBLE_KEY, String(this.isWaveformVisible));
  }

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  editImage = asyncAction(async (args: ImageEditInput) => {
    const stores = getRootStore<RootStore>(this);

    if (this.isEditingImage) throw new Error("An image edit is already being saved.");

    this.setIsEditingImage(true);

    try {
      const result = await trpc.editImage.mutate(args);

      if (!result.success) throw new Error(result.error);

      if (args.saveCopy) {
        const index = this.getFileIndex(args.fileId);

        if (!stores.file.getById(result.data.id))
          stores.file.addFileAfterIndex(
            {
              ...result.data,
              tags: derefMobx(stores.file.getById(args.fileId)?.tags ?? []),
            },
            index,
          );

        if (!this.selectedFileIds.includes(result.data.id))
          this.addFileAfterIndex(result.data.id, index);

        stores.file.setActiveFileId(result.data.id);
        this.setActiveFileId(result.data.id);
      } else {
        stores.file.getById(args.fileId)?.update(result.data);
      }

      return result.data;
    } finally {
      this.setIsEditingImage(false);
    }
  });

  @modelFlow
  extractFrame = asyncAction(async () => {
    if (this.isExtractingFrame) return;

    const activeFile = this.getActiveFile();
    const controller = new AbortController();
    let filePath: string;

    if (!activeFile) throw new Error("Active file not found");

    this.frameAbortController = controller;
    this.setIsExtractingFrame(true);
    this.setIsPlaying(false);

    try {
      filePath = await extractVideoFrame(activeFile.path, this.curFrame, controller.signal);

      const { size } = await fs.stat(filePath);

      controller.signal.throwIfAborted();
      this.setIsSavingFrame(true);

      const res = await trpc.importMediaFile.mutate({
        deleteOnImport: true,
        ext: "jpg",
        ignorePrevDeleted: false,
        originalName: activeFile.originalName,
        originalPath: filePath,
        size,
        tagIds: activeFile.tagIds,
      });

      if (!res.success) throw new Error(res.error);

      await openCarouselWindow({ file: res.data.file, selectedFileIds: [res.data.file.id] });
      toast.success("Frame extracted");
    } catch (error) {
      if (!controller.signal.aborted) toast.error(error);
    } finally {
      try {
        // The importer owns source cleanup and recovery once the frame has been submitted.
        if (filePath && !this.isSavingFrame) await fs.rm(filePath, { force: true });
      } finally {
        this.frameAbortController = null;
        this.setIsExtractingFrame(false);
        this.setIsSavingFrame(false);
      }
    }
  });

  @modelFlow
  loadFiles = asyncAction(async () => {
    const stores = getRootStore<RootStore>(this);

    const index = this.activeFileIndex;
    const ids = [
      ...new Set(
        [
          this.activeFileId,
          ...this.selectedFileIds.slice(Math.max(0, index - 10), index + 11),
          ...this.visibleFileIds,
        ].filter(Boolean),
      ),
    ];
    const search = stores.file.search;

    if (!ids.length) return;

    search.setForcePages(false);
    search.setIds(ids);

    const result = await search.loadFiltered({ noCache: true });

    if (!result.success) throw new Error(result.error);
  });

  @modelFlow
  transcodeVideo = asyncAction(
    async (args?: { force?: boolean; onFirstFrames?: () => void; seekTime?: number }) => {
      const stores = getRootStore<RootStore>(this);

      const activeFile = stores.file.getById(this.activeFileId);

      if (activeFile?.isVideo && (args?.force || this.requiresTranscoding)) {
        this.setTranscodingFileId(activeFile.id);
        this.setIsWaitingForFrames(true);
        this.setSeekOffset((args?.seekTime ?? 0) * activeFile.frameRate);

        try {
          this.setMediaSourceUrl(
            videoTranscoder.transcode(
              activeFile.path,
              activeFile.bitrate,
              this.transcodeBitrate,
              args?.seekTime,
              args?.onFirstFrames,
              this.handleTranscodeError,
            ),
          );
        } catch (error) {
          this.handleTranscodeError(error);
        }
      } else {
        videoTranscoder.dispose();
        this.setIsWaitingForFrames(false);
        this.setMediaSourceUrl(null);
        this.setTranscodingFileId("");
      }
    },
  );

  /* --------------------------------- GETTERS -------------------------------- */
  @computed
  get activeFileIndex() {
    return this.getFileIndex(this.activeFileId);
  }

  @computed
  get requiresTranscoding() {
    const activeFile = this.getActiveFile();

    return Boolean(
      activeFile?.isVideo &&
        (this.transcodingFileId === activeFile.id || !activeFile.isWebPlayable),
    );
  }

  @computed
  get videoMarks() {
    const marks: Mark[] = [];

    if (this.markIn !== null) marks.push({ label: "A", value: this.markIn });

    if (this.markOut !== null) marks.push({ label: "B", value: this.markOut });

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
