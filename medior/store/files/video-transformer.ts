import autoBind from "auto-bind";
import { reaction } from "mobx";
import { getRootStore, Model, model, modelAction, modelFlow, prop } from "mobx-keystone";
import { FileImporter } from "medior/store";
import { File } from "medior/store/files/file";
import { RootStore } from "medior/store/root-store";
import { asyncAction } from "medior/store/utils";
import { deleteFile, getAvailableFileStorage, getConfig, toast } from "medior/utils/client";
import { round } from "medior/utils/common";
import { FfmpegProgress, getVideoInfo, reencode, remux, trpc } from "medior/utils/server";

@model("medior/VideoTransformerStore")
export class VideoTransformerStore extends Model({
  curFileId: prop<string>(null).withSetter(),
  file: prop<File>(null).withSetter(),
  fileIds: prop<string[]>(() => []).withSetter(),
  fnType: prop<"reencode" | "remux">(null).withSetter(),
  isAuto: prop<boolean>(false).withSetter(),
  isLoading: prop<boolean>(false).withSetter(),
  isRunning: prop<boolean>(false).withSetter(),
  isOpen: prop<boolean>(false).withSetter(),
  newHash: prop<string>(null).withSetter(),
  newPath: prop<string>(null).withSetter(),
  progress: prop<FfmpegProgress>(null).withSetter(),
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
  }

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  loadFile = asyncAction(async () => {
    this.setIsLoading(true);
    const res = await trpc.listFile.mutate({ args: { filter: { id: this.curFileId } } });
    this.setFile(new File(res.data.items[0]));
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

    const originalCodec = this.file.videoCodec;
    const newCodec = config.codec.replace("_nvenc", "");
    const originalFps = round(this.file.frameRate, 0);
    const maxFps = round(config.maxFps, 0);
    const originalBitrate = round(this.file.bitrate, 0);
    const maxBitrate = round(config.maxBitrate * 1000, 0);

    const skip = async (newSize?: number) => {
      console.debug(`Skipped re-encode: ${this.file.id}`);
      console.debug({
        originalBitrate,
        originalCodec,
        originalFps,
        maxBitrate,
        maxFps,
        newCodec,
        newSize,
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

      const fn = this.fnType === "reencode" ? reencode : remux;
      const res = await fn(this.file.path, targetDir, {
        signal: this.aborter.signal,
        onProgress: (progress) => this.setProgress(progress),
      });

      this.setNewHash(res.hash);
      this.setNewPath(res.path);
      this.setIsRunning(false);

      if (this.isAuto) {
        const videoInfo = await getVideoInfo(this.newPath);
        if (videoInfo.size >= 0.9 * this.file.size) await skip(videoInfo.size);
        else {
          const replaceRes = await this.replaceOriginal();
          if (!replaceRes.success) throw new Error(replaceRes.error);
        }
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
