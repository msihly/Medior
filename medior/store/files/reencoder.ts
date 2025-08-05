import autoBind from "auto-bind";
import { reaction } from "mobx";
import { getRootStore, Model, model, modelAction, modelFlow, prop } from "mobx-keystone";
import { File } from "medior/store/files/file";
import { RootStore } from "medior/store/root-store";
import { asyncAction } from "medior/store/utils";
import { deleteFile, getAvailableFileStorage } from "medior/utils/client";
import { EncodeProgress, reencodeToHevc, trpc } from "medior/utils/server";

@model("medior/ReencoderStore")
export class ReencoderStore extends Model({
  file: prop<File>(null).withSetter(),
  fileId: prop<string>(null).withSetter(),
  isLoading: prop<boolean>(false).withSetter(),
  isRunning: prop<boolean>(false).withSetter(),
  isOpen: prop<boolean>(false).withSetter(),
  newHash: prop<string>(null).withSetter(),
  newPath: prop<string>(null).withSetter(),
  progress: prop<EncodeProgress>(null).withSetter(),
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
    this.file = null;
    this.fileId = null;
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
    const res = await trpc.listFile.mutate({ args: { filter: { id: this.fileId } } });
    this.setFile(new File(res.data.items[0]));
    this.setIsLoading(false);
  });

  @modelFlow
  replaceOriginal = asyncAction(async () => {
    this.setIsLoading(true);

    const diskRes = await deleteFile(this.file.path, this.newPath);
    if (!diskRes.success) throw new Error(diskRes.error);

    const dbRes = await trpc.updateFile.mutate({
      ext: "mp4",
      hash: this.newHash,
      id: this.fileId,
      path: this.newPath,
      videoCodec: "hevc",
    });
    if (!dbRes.success) throw new Error(dbRes.error);

    const stores = getRootStore<RootStore>(this);
    const refreshRes = await stores.file.refreshFiles({ ids: [this.fileId] });
    if (!refreshRes.success) throw new Error(refreshRes.error);

    this.setIsLoading(false);
    this.setIsOpen(false);
  });

  @modelFlow
  run = asyncAction(async () => {
    try {
      this.setIsRunning(true);
      const storageRes = await getAvailableFileStorage(this.file.size);
      if (!storageRes.success) throw new Error(storageRes.error);
      const targetDir = storageRes.data;

      this.aborter = new AbortController();

      const res = await reencodeToHevc(this.file.path, targetDir, {
        signal: this.aborter.signal,
        onProgress: (progress) => {
          this.setProgress(progress);
        },
      });

      this.setNewHash(res.hash);
      this.setNewPath(res.path);
    } finally {
      this.setIsRunning(false);
    }
  });
}
