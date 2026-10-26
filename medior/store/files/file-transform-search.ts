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
  private fileLoadRevision = 0;
  /** The page load during which a file load set `isLoading`, which the latest file load clears. */
  private pendingFileLoadId: number = null;

  onInit() {
    autoBind(this);

    reaction(
      () => this.results,
      () => this.loadFiles(),
    );
  }

  private endFileLoad() {
    // A page load started since then owns `isLoading` and clears it itself.
    if (this.pendingFileLoadId === this.loadId) this.setIsLoading(false);

    this.pendingFileLoadId = null;
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

  /** Loads the transformed files, unless they are all loaded already. */
  @modelFlow
  loadFiles = asyncAction(async () => {
    const loadId = this.loadId;
    const revision = ++this.fileLoadRevision;
    const fileIds = [...new Set(this.results.map((f) => f.fileId))];

    if (!fileIds.length) {
      this.setFiles(new Map());
      this.endFileLoad();
    } else if (fileIds.every((fileId) => this.files.has(fileId))) this.endFileLoad();
    else {
      this.pendingFileLoadId = loadId;
      this.setIsLoading(true);

      try {
        const files = await loadFilesWithTags(fileIds);

        if (loadId === this.loadId && revision === this.fileLoadRevision) {
          this.setFiles(new Map(files.map((file) => [file.id, new File(file)])));
          this.endFileLoad();
        }
      } catch (error) {
        if (loadId === this.loadId && revision === this.fileLoadRevision) {
          this.endFileLoad();

          throw error;
        }
      }
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
