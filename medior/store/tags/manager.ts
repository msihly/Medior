import { getRootStore, model, Model, modelAction, modelFlow, prop } from "mobx-keystone";
import { asyncAction, RootStore, TagSearch } from "medior/store";
import { makeQueue, PromiseQueue, trpc } from "medior/utils";
import { toast } from "react-toastify";

export type TagManagerMode = "create" | "edit" | "search";

export type TagManagerTag = {
  aliases?: string[];
  count: number;
  dateCreated: string;
  dateModified: string;
  id: string;
  label: string;
  thumbPaths: string[];
};

@model("medior/TagManagerStore")
export class TagManagerStore extends Model({
  isLoading: prop<boolean>(false).withSetter(),
  isMultiTagEditorOpen: prop<boolean>(false).withSetter(),
  isOpen: prop<boolean>(false).withSetter(),
  selectedIds: prop<string[]>(() => []).withSetter(),
  search: prop<TagSearch>(() => new TagSearch({})).withSetter(),
  searchResults: prop<TagManagerTag[]>(() => []).withSetter(),
}) {
  tagRefreshQueue = new PromiseQueue();

  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  toggleTagsSelected(selected: { id: string; isSelected?: boolean }[], withToast = false) {
    if (!selected?.length) return;

    const [added, removed] = selected.reduce(
      (acc, cur) => (acc[cur.isSelected ? 0 : 1].push(cur.id), acc),
      [[], []]
    );

    const removedSet = new Set(removed);
    this.selectedIds = [...new Set(this.selectedIds.concat(added))].filter(
      (id) => !removedSet.has(id)
    );

    if (withToast)
      toast.info(
        `${added.length ? `${added.length} tags selected.` : ""}${
          added.length && removed.length ? "\n" : ""
        }${removed.length ? `${removed.length} tags deselected.` : ""}`
      );
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
        tagIds: this.selectedIds,
      });
      if (!res.success) throw new Error(res.error);
      return res.data;
    }
  );

  @modelFlow
  refreshSelectedTags = asyncAction(async () => {
    const stores = getRootStore<RootStore>(this);
    makeQueue({
      action: async (tagId) => {
        const res = await trpc.refreshTag.mutate({ tagId });
        if (!res.success) throw new Error(res.error);
      },
      items: this.selectedIds,
      logSuffix: "tags",
      onComplete: () => Promise.all([stores.tag.loadTags(), this.search.loadFiltered()]),
      queue: this.tagRefreshQueue,
    });
  });

  /* ----------------------------- DYNAMIC GETTERS ---------------------------- */
  getById(id: string) {
    return this.searchResults.find((t) => t.id === id);
  }

  getIsSelected(id: string) {
    return !!this.selectedIds.find((s) => s === id);
  }
}
