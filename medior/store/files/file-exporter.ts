import autoBind from "auto-bind";
import { reaction } from "mobx";
import { getRootStore, Model, model, modelAction, modelFlow, prop } from "mobx-keystone";
import type { RootStore } from "medior/store";
import { asyncAction, toastJobResult } from "medior/utils/client";
import { FILE_SIDECAR_FIELDS, FileSidecarField } from "medior/utils/common";
import { rpc } from "medior/utils/server";

export type FileCopyDestination = "folder" | "original";

@model("medior/FileExporterStore")
export class FileExporterStore extends Model({
  /** Where copies go: their original paths, or into the chosen folder. */
  copyDestination: prop<FileCopyDestination>("original").withSetter(),
  copyFolder: prop<string>("").withSetter(),
  fields: prop<FileSidecarField[]>(() => [...FILE_SIDECAR_FIELDS]),
  fileIds: prop<string[]>(() => []),
  filePaths: prop<string[]>(() => []),
  isOpen: prop<boolean>(false).withSetter(),
  isPreparing: prop<boolean>(false).withSetter(),
  /** A copy or move back is being started, which closes the modal once it runs. */
  isStarting: prop<boolean>(false).withSetter(),
  sidecarPaths: prop<string[]>(() => []),
  subtitlePaths: prop<string[]>(() => []),
  thumbPath: prop<string>(null),
}) {
  private exportId = 0;

  onInit() {
    autoBind(this);

    reaction(
      () => this.isOpen,
      () => !this.isOpen && this.reset(),
    );
  }

  /** Follows a started copy or move back from the corner, where it can be stopped. */
  private followJob(jobId: string) {
    getRootStore<RootStore>(this).home.followJob(jobId, toastJobResult);
    this.setIsOpen(false);
  }

  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  clearSidecars() {
    this.exportId++;
    this.filePaths = [];
    this.isPreparing = false;
    this.sidecarPaths = [];
    this.subtitlePaths = [];
    this.thumbPath = null;
  }

  @modelAction
  open(fileIds: string[]) {
    this.fileIds = fileIds;
    this.isOpen = true;
  }

  @modelAction
  reset() {
    this.clearSidecars();
    this.fileIds = [];
  }

  @modelAction
  setField(field: FileSidecarField, isIncluded: boolean) {
    this.fields = FILE_SIDECAR_FIELDS.filter((cur) =>
      cur === field ? isIncluded : this.fields.includes(cur),
    );
    this.clearSidecars();
  }

  @modelAction
  setSidecars({
    filePaths,
    sidecarPaths,
    subtitlePaths,
    thumbPath,
  }: {
    filePaths: string[];
    sidecarPaths: string[];
    subtitlePaths: string[];
    thumbPath: string;
  }) {
    this.filePaths = filePaths;
    this.sidecarPaths = sidecarPaths;
    this.subtitlePaths = subtitlePaths;
    this.thumbPath = thumbPath;
  }

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  /** Copies the files out under their original names, leaving the library's copies in place. */
  @modelFlow
  copyFiles = asyncAction(async () => {
    this.setIsStarting(true);

    try {
      const res = await rpc.startFileCopy({
        destination: this.copyDestination === "folder" ? this.copyFolder : null,
        fileIds: [...this.fileIds],
      });
      if (!res.success) throw new Error(res.error);

      this.followJob(res.data);
    } finally {
      this.setIsStarting(false);
    }
  });

  @modelFlow
  createSidecars = asyncAction(async () => {
    const exportId = ++this.exportId;

    this.setIsPreparing(true);

    try {
      const res = await rpc.createFileExportSidecars({
        fields: [...this.fields],
        fileIds: [...this.fileIds],
      });
      if (exportId !== this.exportId) return;
      if (!res.success) throw new Error(res.error);

      this.setSidecars(res.data);
    } finally {
      if (exportId === this.exportId) this.setIsPreparing(false);
    }
  });

  /** Moves the stored files back to their original paths, where they stay linked in the library. */
  @modelFlow
  moveFilesBack = asyncAction(async () => {
    this.setIsStarting(true);

    try {
      const res = await rpc.startFileMoveBack({ fileIds: [...this.fileIds] });
      if (!res.success) throw new Error(res.error);

      this.followJob(res.data);
    } finally {
      this.setIsStarting(false);
    }
  });
}
