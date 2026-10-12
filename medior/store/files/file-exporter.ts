import autoBind from "auto-bind";
import { reaction } from "mobx";
import { Model, model, modelAction, modelFlow, prop } from "mobx-keystone";
import { asyncAction } from "medior/utils/client";
import { FILE_SIDECAR_FIELDS, FileSidecarField } from "medior/utils/common";
import { trpc } from "medior/utils/server";

@model("medior/FileExporterStore")
export class FileExporterStore extends Model({
  fields: prop<FileSidecarField[]>(() => [...FILE_SIDECAR_FIELDS]),
  fileIds: prop<string[]>(() => []),
  filePaths: prop<string[]>(() => []),
  isOpen: prop<boolean>(false).withSetter(),
  isPreparing: prop<boolean>(false).withSetter(),
  sidecarPaths: prop<string[]>(() => []),
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

  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  clearSidecars() {
    this.exportId++;
    this.filePaths = [];
    this.isPreparing = false;
    this.sidecarPaths = [];
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
    thumbPath,
  }: {
    filePaths: string[];
    sidecarPaths: string[];
    thumbPath: string;
  }) {
    this.filePaths = filePaths;
    this.sidecarPaths = sidecarPaths;
    this.thumbPath = thumbPath;
  }

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  createSidecars = asyncAction(async () => {
    const exportId = ++this.exportId;

    this.setIsPreparing(true);

    try {
      const res = await trpc.createFileExportSidecars.mutate({
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
}
