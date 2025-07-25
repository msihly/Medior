import autoBind from "auto-bind";
import { getRootStore, Model, model, modelAction, modelFlow, prop } from "mobx-keystone";
import { TagSchema } from "medior/server/database";
import { asyncAction, RootStore, TagSearch } from "medior/store";
import { makeQueue } from "medior/utils/client";
import { PromiseQueue } from "medior/utils/common";
import { trpc } from "medior/utils/server";

export type TagManagerMode = "create" | "edit" | "search";

export type TagManagerTag = {
  aliases?: string[];
  count: number;
  dateCreated: string;
  dateModified: string;
  id: string;
  label: string;
  thumb: TagSchema["thumb"];
};

@model("medior/TagManagerStore")
export class TagManagerStore extends Model({
  isLoading: prop<boolean>(false).withSetter(),
  isMultiTagEditorOpen: prop<boolean>(false).withSetter(),
  isOpen: prop<boolean>(false).withSetter(),
  search: prop<TagSearch>(() => new TagSearch({})).withSetter(),
}) {
  refreshQueue = new PromiseQueue();

  onInit() {
    autoBind(this);
  }

  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  clearRefreshQueue() {
    this.refreshQueue.cancel();
    this.refreshQueue = new PromiseQueue();
  }

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  editMultiTagRelations = asyncAction(
    async ({
      childIdsToAdd,
      childIdsToRemove,
      parentIdsToAdd,
      parentIdsToRemove,
    }: {
      childIdsToAdd: string[];
      childIdsToRemove: string[];
      parentIdsToAdd: string[];
      parentIdsToRemove: string[];
    }) => {
      const res = await trpc.editMultiTagRelations.mutate({
        childIdsToAdd,
        childIdsToRemove,
        parentIdsToAdd,
        parentIdsToRemove,
        tagIds: this.search.selectedIds,
      });
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
  );

  @modelFlow
  refreshSelectedTags = asyncAction(async () => {
    const stores = getRootStore<RootStore>(this);
    makeQueue({
      action: async (tagId) => {
        const res = await trpc.refreshTag.mutate({ tagId });
        if (!res.success) throw new Error(res.error);
      },
      items: this.search.selectedIds,
      logPrefix: "Refreshed",
      logSuffix: "tags",
      onComplete: () => Promise.all([stores.tag.loadTags(), this.search.loadFiltered()]),
      queue: this.refreshQueue,
    });
  });

  /* ----------------------------- DYNAMIC GETTERS ---------------------------- */
  getById(id: string) {
    return this.search.results.find((t) => t.id === id);
  }

  getIsSelected(id: string) {
    return !!this.search.selectedIds.find((s) => s === id);
  }
}
