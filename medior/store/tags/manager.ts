import autoBind from "auto-bind";
import { Model, model, modelAction, modelFlow, prop } from "mobx-keystone";
import { TagOption, TagSearch } from "medior/store";
import { asyncAction, toast } from "medior/utils/client";
import { trpc } from "medior/utils/server";

export type TagManagerMode = "create" | "edit" | "search";

@model("medior/TagManagerStore")
export class TagManagerStore extends Model({
  isLoading: prop<boolean>(false).withSetter(),
  isMultiTagEditorOpen: prop<boolean>(false).withSetter(),
  isOpen: prop<boolean>(false).withSetter(),
  search: prop<TagSearch>(() => new TagSearch({})).withSetter(),
}) {
  onInit() {
    autoBind(this);
  }

  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  findTagsOnSameFiles(tag: TagOption) {
    this.search.reset();
    this.search.setFileTags([tag]);

    if (this.isOpen) this.search.loadFiltered({ page: 1 });
    else this.setIsOpen(true);
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
    const result = await trpc.refreshTag.mutate({ tagIds: this.search.selectedIds });
    if (!result.success) throw new Error(result.error);

    toast.success("Tag refresh queued in Activity");
  });

  /* ----------------------------- DYNAMIC GETTERS ---------------------------- */
  getById(id: string) {
    return this.search.results.find((t) => t.id === id);
  }

  getIsSelected(id: string) {
    return !!this.search.selectedIds.find((s) => s === id);
  }
}
