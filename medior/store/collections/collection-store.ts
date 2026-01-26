import autoBind from "auto-bind";
import { Model, model, modelFlow, prop } from "mobx-keystone";
import * as Types from "medior/server/database/types";
import { asyncAction } from "medior/store";
import { toast } from "medior/utils/client";
import { PromiseQueue } from "medior/utils/common";
import { trpc } from "medior/utils/server";
import { CollectionEditor, CollectionManager } from ".";

@model("medior/FileCollectionStore")
export class FileCollectionStore extends Model({
  collectionFitMode: prop<"cover" | "contain">("contain").withSetter(),
  editor: prop<CollectionEditor>(() => new CollectionEditor({})),
  isConfirmDeleteOpen: prop<boolean>(false).withSetter(),
  manager: prop<CollectionManager>(() => new CollectionManager({})),
}) {
  metaRefreshQueue = new PromiseQueue();

  onInit() {
    autoBind(this);
  }

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  createCollection = asyncAction(
    async ({ fileIdIndexes, title, withSub = true }: Types.CreateCollectionInput) => {
      const res = await trpc.createCollection.mutate({ fileIdIndexes, title, withSub });
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
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
  regenCollMeta = asyncAction(async (collIds: string[]) => {
    this.editor.setIsLoading(true);
    const res = await trpc.regenCollAttrs.mutate({ collIds });
    this.editor.setIsLoading(false);
    if (!res.success) throw new Error(res.error);
    toast.success("Metadata refreshed!");
  });

  @modelFlow
  updateCollRating = asyncAction(async (args: { id: string; rating: number }) => {
    this.manager.setIsLoading(true);
    const res = await trpc.updateCollection.mutate({
      id: args.id,
      rating: args.rating,
      ratingIsManual: args.rating > 0,
    });
    this.manager.setIsLoading(false);
    if (!res.success) throw new Error(res.error);
  });
}
