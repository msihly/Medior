import autoBind from "auto-bind";
import { Model, model, modelFlow, prop } from "mobx-keystone";
import * as Types from "medior/server/database/types";
import { asyncAction, toast } from "medior/utils/client";
import { rpc } from "medior/utils/server";
import { CollectionEditor, CollectionManager } from ".";

@model("medior/FileCollectionStore")
export class FileCollectionStore extends Model({
  editor: prop<CollectionEditor>(() => new CollectionEditor({})),
  idsForConfirmDelete: prop<string[]>(() => []).withSetter(),
  isConfirmDeleteOpen: prop<boolean>(false).withSetter(),
  manager: prop<CollectionManager>(() => new CollectionManager({})),
}) {
  onInit() {
    autoBind(this);
  }

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  createCollection = asyncAction(
    async ({ fileIdIndexes, title, withSub = true }: Types.CreateCollectionInput) => {
      const res = await rpc.createCollection({ fileIdIndexes, title, withSub });

      if (!res.success) throw new Error(res.error);

      return res.data;
    },
  );

  @modelFlow
  deleteCollections = asyncAction(async (ids: string[]) => {
    const res = await rpc.deleteCollections({ ids });

    if (!res.success) throw new Error(res.error);
  });

  @modelFlow
  regenCollMeta = asyncAction(async (collIds: string[]) => {
    this.editor.setIsLoading(true);
    this.manager.setIsLoading(true);

    try {
      const res = await rpc.regenCollAttrs({ collIds });
      if (!res.success) throw new Error(res.error);

      toast.success("Collection metadata refresh queued in Activity");
    } finally {
      this.editor.setIsLoading(false);
      this.manager.setIsLoading(false);
    }
  });

  @modelFlow
  updateCollRating = asyncAction(async (args: { id: string; rating: number }) => {
    this.manager.setIsLoading(true);

    try {
      const res = await rpc.updateCollection({
        id: args.id,
        rating: args.rating,
        ratingIsManual: args.rating > 0,
      });

      if (!res.success) throw new Error(res.error);

      for (const collection of new Set(
        [
          this.editor.collection,
          ...this.manager.currentCollections,
          ...this.manager.search.results,
        ].filter((collection) => collection?.id === args.id),
      ))
        collection.update({ rating: args.rating, ratingIsManual: args.rating > 0 });
    } finally {
      this.manager.setIsLoading(false);
    }
  });
}
