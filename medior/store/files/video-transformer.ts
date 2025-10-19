import autoBind from "auto-bind";
import { reaction } from "mobx";
import { getRootStore, Model, model, modelAction, modelFlow, prop } from "mobx-keystone";
import { File } from "medior/store/files/file";
import { RootStore } from "medior/store/root-store";
import { asyncAction } from "medior/store/utils";
import { deleteFile, getAvailableFileStorage, getConfig, toast } from "medior/utils/client";
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
  replaceOriginal = asyncAction(async () => {
    this.setIsLoading(true);

    const originalPath = this.file.path;
    const videoInfo = await getVideoInfo(this.newPath);

    const dbRes = await trpc.updateFile.mutate({
      ...videoInfo,
      hash: this.newHash,
      id: this.curFileId,
      path: this.newPath,
    });
    if (!dbRes.success) throw new Error(dbRes.error);

    const stores = getRootStore<RootStore>(this);

    const onComplete = getConfig().file.reencode.onComplete;
    if (onComplete.addTagIds.length > 0 || onComplete.removeTagIds.length > 0) {
      const tagsRes = await stores.file.editFileTags({
        fileIds: [this.curFileId],
        addedTagIds: onComplete.addTagIds,
        removedTagIds: onComplete.removeTagIds,
        withSub: false,
        withToast: false,
      });
      if (!tagsRes.success) {
        console.error("reencode.onComplete failed", tagsRes.error);
        toast.warn("Failed to update tags");
      }
    }

    const refreshRes = await stores.file.refreshFiles({ ids: [this.curFileId] });
    if (!refreshRes.success) throw new Error(refreshRes.error);

    const diskRes = await deleteFile(originalPath, this.newPath);
    if (!diskRes.success) throw new Error(diskRes.error);

    this.setIsLoading(false);

    const nextFileId = this.fileIds[0];
    if (!nextFileId) {
      this.setIsOpen(false);
    } else {
      this.setCurFileId(nextFileId);
      this.setFileIds(this.fileIds.slice(1));
      await this.loadFile();
      if (this.isAuto) this.run();
    }
  });

  @modelFlow
  run = asyncAction(async () => {
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
    } catch (error) {
      console.error(error);
      toast.error(error.message);
    } finally {
      this.setIsRunning(false);
    }

    if (this.isAuto) await this.replaceOriginal();
  });
}
