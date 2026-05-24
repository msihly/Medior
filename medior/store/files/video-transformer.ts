import autoBind from "auto-bind";
import { reaction } from "mobx";
import { getRootStore, Model, model, modelAction, modelFlow, prop } from "mobx-keystone";
import { FileImporter } from "medior/store";
import { File } from "medior/store/files/file";
import { RootStore } from "medior/store/root-store";
import { asyncAction, openCarouselWindow, toast } from "medior/utils/client";
import { round } from "medior/utils/common";
import { deleteFile, getAvailableFileStorage, getConfig, trpc } from "medior/utils/server";
import {
  FfmpegOptions,
  FfmpegProgress,
  getVideoInfo,
  reencode,
  remux,
  spliceVideo,
} from "medior/utils/server/videos";

@model("medior/VideoTransformerStore")
export class VideoTransformerStore extends Model({
  curFileId: prop<string>(null).withSetter(),
  curTotalSize: prop<number>(0).withSetter(),
  file: prop<File>(null).withSetter(),
  fileIds: prop<string[]>(() => []).withSetter(),
  fnType: prop<"reencode" | "remux" | "splice">(null).withSetter(),
  initialTotalSize: prop<number>(0).withSetter(),
  isAuto: prop<boolean>(false).withSetter(),
  isLoading: prop<boolean>(false).withSetter(),
  isRunning: prop<boolean>(false).withSetter(),
  isOpen: prop<boolean>(false).withSetter(),
  newHash: prop<string>(null).withSetter(),
  newPath: prop<string>(null).withSetter(),
  outputBitrate: prop<number>(null).withSetter(),
  outputFps: prop<number>(null).withSetter(),
  outputCodec: prop<string>(null).withSetter(),
  progress: prop<FfmpegProgress>(null).withSetter(),
  timestampPairs: prop<Array<[number, number]>>(() => []).withSetter(),
}) {
  aborter: AbortController = null;

  onInit() {
    autoBind(this);

    reaction(
      () => this.isOpen,
      () => !this.isOpen && this.reset(),
    );
  }

  /* ------------------------------ STANDARD ACTIONS ----------------------------- */
  @modelAction
  cancel() {
    if (this.aborter !== null) this.aborter.abort("Cancelled");
    else throw new Error("No aborter set");
  }

  @modelAction
  reset() {
    this.curFileId = null;
    this.file = null;
    this.fileIds = [];
    this.fnType = null;
    this.isAuto = false;
    this.isLoading = false;
    this.isRunning = false;
    this.newHash = null;
    this.newPath = null;
    this.progress = null;
    this.timestampPairs = [];
  }

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  loadFile = asyncAction(async () => {
    this.setIsLoading(true);
    const res = await trpc.listFile.mutate({ args: { filter: { id: this.curFileId } } });
    this.setFile(new File(res.data.items[0]));
    this.setProgress(null);
    this.setIsLoading(false);
  });

  @modelFlow
  loadNextFile = asyncAction(async () => {
    const nextFileId = this.fileIds[0];
    if (!nextFileId) {
      this.setIsOpen(false);
    } else {
      this.setCurFileId(nextFileId);
      this.setFileIds(this.fileIds.slice(1));
      this.setNewPath(null);
      await this.loadFile();
      if (this.isAuto) this.run();
    }
  });

  @modelFlow
  replaceOriginal = asyncAction(async () => {
    const config = getConfig().file.reencode;

    try {
      this.setIsLoading(true);

      const originalPath = this.file.path;
      const videoInfo = await getVideoInfo(this.newPath);

      const dbRes = await trpc.updateFile.mutate({
        args: {
          id: this.curFileId,
          updates: {
            ...videoInfo,
            hash: this.newHash,
            path: this.newPath,
          },
        },
      });
      if (!dbRes.success) throw new Error(dbRes.error);

      await this.updateTags(getConfig().file.reencode.onComplete);

      const filesRes = await trpc.listFile.mutate({ args: { filter: { id: this.curFileId } } });
      if (!filesRes?.success) throw new Error("Failed to load files");
      const file = filesRes.data.items[0];

      const importer = new FileImporter({
        deleteOnImport: false,
        ext: file.ext,
        ignorePrevDeleted: false,
        originalName: file.originalName,
        originalPath: file.path,
        size: file.size,
        tagIds: file.tagIds,
      });

      const refreshRes = await importer.refresh(file);
      if (!refreshRes.success) throw new Error(refreshRes.error);

      const diskRes = await deleteFile(originalPath, this.newPath);
      if (!diskRes.success) throw new Error(diskRes.error);

      this.setCurTotalSize(this.curTotalSize - this.file.size);

      this.setIsLoading(false);
      await this.loadNextFile();
    } catch (error) {
      this.setIsLoading(false);

      if (error.message.includes("duplicate key error")) {
        console.debug(`Video transform resulted in duplicate: ${this.newHash}`);
        await this.updateTags(config.onDuplicate);
        this.loadNextFile();
      } else {
        throw new Error(error);
      }
    }
  });

  @modelFlow
  run = asyncAction(async () => {
    const config = getConfig().file.reencode;

    const willReencode =
      this.fnType === "reencode" || (this.fnType === "splice" && this.file.ext !== "mp4");

    const originalCodec = this.file.videoCodec;
    const newCodec = config.codec.replace("_nvenc", "");
    const outputCodec = !willReencode ? originalCodec : newCodec;

    const originalFps = round(this.file.frameRate, 0);
    const maxFps = round(config.maxFps, 0);
    const outputFps = !willReencode ? originalFps : originalFps > maxFps ? maxFps : originalFps;

    const originalBitrate = round(this.file.bitrate, 0);
    const maxBitrate = round(config.maxBitrate * 1000, 0);
    const outputBitrate = !willReencode
      ? originalBitrate
      : originalBitrate > maxBitrate
        ? maxBitrate
        : originalBitrate;

    this.setOutputBitrate(outputBitrate);
    this.setOutputCodec(outputCodec);
    this.setOutputFps(outputFps);

    const skip = async (newSize?: number) => {
      console.debug("Skipped re-encode", this.file.id, {
        maxBitrate,
        maxFps,
        newCodec,
        newSize,
        originalBitrate,
        originalCodec,
        originalFps,
        outputBitrate,
        outputCodec,
        outputFps,
      });

      toast.warn("Skipped re-encode");
      await this.updateTags(config.onSkip);
      this.loadNextFile();
    };

    if (
      this.fnType === "reencode" &&
      originalCodec === newCodec &&
      originalFps <= maxFps &&
      originalBitrate <= maxBitrate
    ) {
      return await skip();
    }

    try {
      this.setIsRunning(true);
      const storageRes = await getAvailableFileStorage(this.file.size);
      if (!storageRes.success) throw new Error(storageRes.error);
      const targetDir = storageRes.data.location;

      this.aborter = new AbortController();
      const options: FfmpegOptions = {
        signal: this.aborter.signal,
        onProgress: (progress) => this.setProgress(progress),
      };

      let res: { hash: string; path: string } = null;
      if (this.fnType === "splice") {
        res = await spliceVideo(this.file.path, targetDir, this.timestampPairs, options);
      } else {
        const fn = this.fnType === "reencode" ? reencode : remux;
        res = await fn(this.file.path, targetDir, options);
      }

      this.setNewHash(res.hash);
      this.setNewPath(res.path);
      this.setIsRunning(false);
      if (!this.isAuto) return;

      const videoInfo = await getVideoInfo(this.newPath);
      if (this.fnType === "reencode" && videoInfo.size >= 0.9 * this.file.size) {
        await skip(videoInfo.size);
      } else if (this.fnType === "splice") {
        const res = await this.saveSpliced();
        if (!res.success) throw new Error(res.error);
      } else {
        const replaceRes = await this.replaceOriginal();
        if (!replaceRes.success) throw new Error(replaceRes.error);
      }
    } catch (error) {
      this.setIsRunning(false);

      if (error.message.includes("SIGKILL")) {
        console.debug(`Cancelled`);
        toast.warn(`Cancelled`);
      } else {
        console.error(error);
        toast.error(error.message);
        await this.updateTags(config.onError);
        if (this.isAuto) this.loadNextFile();
      }
    }
  });

  @modelFlow
  saveSpliced = asyncAction(async () => {
    try {
      this.setIsLoading(true);

      const videoInfo = await getVideoInfo(this.newPath);

      const config = getConfig().file.splice.onComplete;
      const tagIds = [
        ...this.file.tagIds.filter((id) => !config.removeTagIds.includes(id)),
        ...config.addTagIds,
      ];

      const importer = new FileImporter({
        deleteOnImport: false,
        ext: videoInfo.ext,
        ignorePrevDeleted: false,
        originalName: this.file.originalName,
        originalPath: this.newPath,
        size: videoInfo.size,
        tagIds,
      });

      const res = await importer.import();
      this.setIsLoading(false);
      if (!res.success) throw new Error(res.error);

      toast.success("Video rendered");
      await openCarouselWindow({ file: res.file, selectedFileIds: [res.file.id] });
      this.setIsOpen(false);
    } catch (error) {
      this.setIsLoading(false);

      if (error.message.includes("duplicate key error")) {
        console.debug(`Video transform resulted in duplicate: ${this.newHash}`);
        throw new Error("Render resulted in duplicate");
      } else throw new Error(error);
    }
  });

  @modelFlow
  updateTags = asyncAction(async (args: { addTagIds: string[]; removeTagIds: string[] }) => {
    const stores = getRootStore<RootStore>(this);

    if (args.addTagIds.length > 0 || args.removeTagIds.length > 0) {
      const tagsRes = await stores.file.editFileTags({
        fileIds: [this.curFileId],
        addedTagIds: args.addTagIds,
        removedTagIds: args.removeTagIds,
        withSub: false,
        withToast: false,
      });
      if (!tagsRes.success) {
        console.error("Video transformer updateTags failed", tagsRes.error);
        toast.warn("Failed to update tags");
      }
    }
  });
}
