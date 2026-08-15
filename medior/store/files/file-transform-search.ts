import autoBind from "auto-bind";
import { reaction } from "mobx";
import { ExtendedModel, model, modelFlow, objectToMapTransform, prop } from "mobx-keystone";
import { _FileTransformSearch } from "medior/store/_generated";
import { File } from "medior/store";
import { asyncAction } from "medior/utils/client";
import { trpc } from "medior/utils/server";

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
      () => this.loadFiles(),
    );
  }

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  loadFiles = asyncAction(async () => {
    const fileIds = [...new Set(this.results.map((f) => f.fileId))];
    if (!fileIds.length) return this.setFiles(new Map());

    this.setIsLoading(true);
    const res = await trpc.listFile
      .mutate({ args: { filter: { id: fileIds } } })
      .finally(() => this.setIsLoading(false));
    if (!res.success) throw new Error(res.error);

    const tagIds = [...new Set(res.data.items.flatMap((file) => file.tagIds))];
    const tagRes = await trpc.listTag.mutate({ filter: { id: tagIds } });
    if (!tagRes.success) throw new Error(tagRes.error);

    this.setFiles(
      new Map(
        res.data.items.map((file) => [
          file.id,
          new File({ ...file, tags: tagRes.data.filter((tag) => file.tagIds.includes(tag.id)) }),
        ]),
      ),
    );
  });

  @modelFlow
  listIdsForCarousel = asyncAction(async () => {
    const res = await trpc.listFilteredFileTransform.mutate({
      ...this.getFilterProps(),
      page: this.page,
      pageSize: this.pageSize,
    });
    if (!res.success) throw new Error(res.error);

    const fileIds = res.data.map((transform) => transform.fileId);
    if (!fileIds.length) throw new Error("No files found");
    return fileIds;
  });

  @modelFlow
  handleFileSelect = asyncAction(
    async ({ hasCtrl, hasShift, id }: { hasCtrl: boolean; hasShift: boolean; id: string }) => {
      const transform = this.getFileTransformByFileId(id);
      if (!transform) throw new Error("File transform not found");
      const res = await this.handleSelect({ hasCtrl, hasShift, id: transform.id });
      if (!res?.success) throw new Error(res.error);
    },
  );

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
