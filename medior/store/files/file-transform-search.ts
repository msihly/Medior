import autoBind from "auto-bind";
import { reaction } from "mobx";
import { ExtendedModel, model, modelFlow, objectToMapTransform, prop } from "mobx-keystone";
import { _FileTransformSearch } from "medior/store/_generated";
import { File } from "medior/store";
import { asyncAction, loadFilesWithTags } from "medior/utils/client";

@model("medior/FileTransformSearch")
export class FileTransformSearch extends ExtendedModel(_FileTransformSearch, {
  files: prop<Record<string, File>>(() => ({}))
    .withTransform(objectToMapTransform<File>())
    .withSetter(),
}) {
  onInit() {
    autoBind(this);

    reaction(
      () => this.results,
      () => {
        if (!this.results.length) this.setFiles(new Map());
        else if (this.results.some((transform) => !this.files.has(transform.fileId)))
          this.loadFiles();
      },
    );
  }

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  handleFileSelect = asyncAction(
    async ({ hasCtrl, hasShift, id }: { hasCtrl: boolean; hasShift: boolean; id: string }) => {
      const transform = this.getFileTransformByFileId(id);

      if (!transform) throw new Error("File transform not found");

      const res = await this.handleSelect({ hasCtrl, hasShift, id: transform.id });

      if (!res?.success) throw new Error(res.error);
    },
  );

  @modelFlow
  listIdsForCarousel = asyncAction(async () => {
    const fileIds = this.results.map((transform) => transform.fileId);

    if (!fileIds.length) throw new Error("No files found");

    return fileIds;
  });

  @modelFlow
  loadFiles = asyncAction(async () => {
    const loadId = this.loadId;
    const results = this.results;

    this.setIsLoading(true);

    try {
      const fileIds = [...new Set(this.results.map((f) => f.fileId))];

      if (!fileIds.length) {
        if (loadId === this.loadId) {
          this.setFiles(new Map());
          this.setIsLoading(false);
        }
      } else {
        const files = await loadFilesWithTags(fileIds);

        if (loadId !== this.loadId || results !== this.results) return;

        this.setFiles(new Map(files.map((file) => [file.id, new File(file)])));
        this.setIsLoading(false);
      }
    } catch (error) {
      if (loadId !== this.loadId || results !== this.results) return;

      this.setIsLoading(false);

      throw error;
    }
  });

  /* ----------------------------- DYNAMIC GETTERS ---------------------------- */
  getFileTransformByFileId(fileId: string) {
    return this.results.find((transform) => transform.fileId === fileId);
  }

  getIsFileSelected(fileId: string) {
    const transform = this.getFileTransformByFileId(fileId);

    return transform ? this.getIsSelected(transform.id) : false;
  }

  getSelectedFileIds(fileId: string) {
    if (!this.getIsFileSelected(fileId)) return [fileId];

    const selectedIds = new Set(this.selectedIds);

    return this.results
      .filter((transform) => selectedIds.has(transform.id))
      .map((transform) => transform.fileId);
  }
}
