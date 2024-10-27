import { toast } from "react-toastify";
import { Model, model, modelFlow, prop } from "mobx-keystone";
import { asyncAction } from "medior/store";
import { _FileCollectionStore } from "medior/store/_generated";
import * as Types from "medior/database/types";
import { CollectionEditor, CollectionManager } from ".";
import { makeQueue, PromiseQueue, trpc } from "medior/utils";

@model("medior/FileCollectionStore")
export class FileCollectionStore extends Model({
  collectionFitMode: prop<"cover" | "contain">("contain").withSetter(),
  editor: prop<CollectionEditor>(() => new CollectionEditor({})),
  isConfirmDeleteOpen: prop<boolean>(false).withSetter(),
  manager: prop<CollectionManager>(() => new CollectionManager({})),
}) {
  metaRefreshQueue = new PromiseQueue();

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  createCollection = asyncAction(
    async ({ fileIdIndexes, title, withSub = true }: Types.CreateCollectionInput) => {
      const res = await trpc.createCollection.mutate({ fileIdIndexes, title, withSub });
      if (!res.success) throw new Error(res.error);
      toast.success(`Collection "${title}" created!`);
      return res.data;
    }
  );

  @modelFlow
  deleteCollections = asyncAction(async (ids: string[]) => {
    const res = await trpc.deleteCollections.mutate({ ids });
    if (!res.success) throw new Error(res.error);
  });

  @modelFlow
  deleteDuplicates = asyncAction(async () => {
    const res = await trpc.deduplicateCollections.mutate();
    if (!res.success) throw new Error(res.error);
    toast.success(`Deleted ${res.data} duplicate collections`);
    await this.manager.search.loadFiltered();
  });

  @modelFlow
  deleteEmptyCollections = asyncAction(async () => {
    const res = await trpc.deleteEmptyCollections.mutate();
    if (!res.success) throw new Error(res.error);
    toast.success(`Deleted ${res.data} empty collections`);

    await this.manager.search.loadFiltered();
  });

  @modelFlow
  regenAllCollMeta = asyncAction(async () => {
    const collectionIdsRes = await trpc.listAllCollectionIds.mutate();
    if (!collectionIdsRes.success) throw new Error(collectionIdsRes.error);

    await makeQueue({
      action: async (id) => {
        const res = await trpc.regenCollAttrs.mutate({ collIds: [id] });
        if (!res.success) throw new Error(res.error);
      },
      items: collectionIdsRes.data,
      logSuffix: "collections",
      queue: this.metaRefreshQueue,
    });

    await this.manager.search.loadFiltered();
  });

  @modelFlow
  regenCollMeta = asyncAction(async (collIds: string[]) => {
    this.editor.setIsLoading(true);
    const res = await trpc.regenCollAttrs.mutate({ collIds });
    this.editor.setIsLoading(false);
    if (!res.success) throw new Error(res.error);
    toast.success("Metadata refreshed!");
  });
}
