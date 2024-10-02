import { model, Model, modelAction, ModelCreationData, modelFlow, prop } from "mobx-keystone";
import { asyncAction } from "medior/store";
import { FileImport, FileImportBatch, ImportEditor, ImportManager } from ".";
import { trpc } from "medior/utils";

export type ImportBatchInput = Omit<ModelCreationData<FileImportBatch>, "imports"> & {
  imports?: ModelCreationData<FileImport>[];
};

@model("medior/ImportStore")
export class ImportStore extends Model({
  deletedFileHashes: prop<string[]>(() => []).withSetter(),
  editor: prop<ImportEditor>(() => new ImportEditor({})),
  manager: prop<ImportManager>(() => new ImportManager({})),
}) {
  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  addDeletedFileHashes(hashes: string[]) {
    this.deletedFileHashes = [...new Set(...this.deletedFileHashes, ...hashes)];
  }

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  loadDeletedFiles = asyncAction(async () => {
    const res = await trpc.listDeletedFiles.mutate();
    if (res.success) this.deletedFileHashes = res.data.map((f) => f.hash);
  });
}
