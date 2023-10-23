import { computed } from "mobx";
import {
  _async,
  _await,
  model,
  Model,
  modelAction,
  ModelCreationData,
  modelFlow,
  prop,
} from "mobx-keystone";
import { CreateTagInput, EditTagInput } from "database";
import { Tag } from ".";
import { getArrayDiff, handleErrors, PromiseQueue, trpc } from "utils";
import { toast } from "react-toastify";

export type TagOption = {
  aliases?: string[];
  count: number;
  id: string;
  label?: string;
};

@model("mediaViewer/TagStore")
export class TagStore extends Model({
  activeTagId: prop<string>(null).withSetter(),
  isTagManagerOpen: prop<boolean>(false).withSetter(),
  tags: prop<Tag[]>(() => []),
  tagManagerMode: prop<"create" | "edit" | "search">("search").withSetter(),
}) {
  countsRefreshQueue = new PromiseQueue();
  relationsRefreshQueue = new PromiseQueue();

  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  _addTag = (tag: ModelCreationData<Tag>) => this.tags.push(new Tag(tag));

  @modelAction
  _deleteTag = (id: string) => {
    this.tags.forEach((t) => {
      if (t.parentIds.includes(id)) t.parentIds.splice(t.parentIds.indexOf(id));
      if (t.childIds.includes(id)) t.childIds.splice(t.childIds.indexOf(id));
    });
    this.tags.splice(this.tags.findIndex((t) => t.id === id));
  };

  @modelAction
  overwrite = (tags: ModelCreationData<Tag>[]) => {
    this.tags = tags.map((t) => new Tag(t));
  };

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  createTag = _async(function* (
    this: TagStore,
    { aliases = [], childIds = [], label, parentIds = [], withSub = true }: CreateTagInput
  ) {
    return yield* _await(
      handleErrors(async () => {
        const res = await trpc.createTag.mutate({ aliases, childIds, label, parentIds });
        if (!res.success) throw new Error(res.error);
        const id = res.data.id;
        const tag = { aliases, childIds, count: 0, hidden: false, id, label, parentIds };

        this._addTag(tag);
        await this.refreshTagRelations({ id });
        await this.refreshRelatedTagCounts({ id });
        toast.success(`Tag '${label}' created`);

        if (withSub) trpc.onTagCreated.mutate({ tag });
        return tag;
      })
    );
  });

  @modelFlow
  deleteTag = _async(function* (this: TagStore, { id }: { id: string }) {
    return yield* _await(
      handleErrors(async () => {
        await Promise.all([
          trpc.removeTagFromAllFiles.mutate({ tagId: id }),
          trpc.removeTagFromAllBatches.mutate({ tagId: id }),
          trpc.removeTagFromAllChildTags.mutate({ tagId: id }),
          trpc.removeTagFromAllParentTags.mutate({ tagId: id }),
        ]);

        await this.refreshRelatedTagCounts({ id });
        await trpc.deleteTag.mutate({ id });
        await trpc.onTagDeleted.mutate({ tagId: id });
      })
    );
  });

  @modelFlow
  editTag = _async(function* (
    this: TagStore,
    { aliases, childIds, id, label, parentIds }: EditTagInput
  ) {
    return yield* _await(
      handleErrors(async () => {
        const tag = this.getById(id);

        const [addedChildIds, removedChildIds] = getArrayDiff(tag.childIds, childIds).reduce(
          (acc, cur) => {
            if (childIds.includes(cur)) acc[0].push(cur);
            else if (tag.childIds.includes(cur)) acc[1].push(cur);
            return acc;
          },
          [[], []] as string[][]
        );

        const [addedParentIds, removedParentIds] = getArrayDiff(tag.parentIds, parentIds).reduce(
          (acc, cur) => {
            if (parentIds.includes(cur)) acc[0].push(cur);
            else if (tag.parentIds.includes(cur)) acc[1].push(cur);
            return acc;
          },
          [[], []] as string[][]
        );

        if (addedChildIds?.length > 0)
          await trpc.addParentTagIdsToTags.mutate({ tagIds: addedChildIds, parentTagIds: [id] });
        if (addedParentIds?.length > 0)
          await trpc.addChildTagIdsToTags.mutate({ tagIds: addedParentIds, childTagIds: [id] });

        if (removedChildIds?.length > 0)
          await trpc.removeParentTagIdsFromTags.mutate({
            tagIds: removedChildIds,
            parentTagIds: [id],
          });
        if (removedParentIds?.length > 0)
          await trpc.removeChildTagIdsFromTags.mutate({
            tagIds: removedParentIds,
            childTagIds: [id],
          });

        await trpc.editTag.mutate({ id, aliases, childIds, label, parentIds });
        await this.refreshTagCount({ id });

        toast.success("Tag edited");
      })
    );
  });

  @modelFlow
  loadTags = _async(function* (this: TagStore) {
    return yield* _await(
      handleErrors(async () => {
        this.overwrite((await trpc.listTags.mutate())?.data);
      })
    );
  });

  @modelFlow
  refreshAllTagCounts = _async(function* (
    this: TagStore,
    { silent = false }: { silent?: boolean } = {}
  ) {
    return yield* _await(
      handleErrors(async () => {
        let completedCount = 0;
        const totalCount = this.tags.length;

        const toastId = silent
          ? null
          : toast.info(() => `Refreshed ${completedCount} tag counts...`, { autoClose: false });

        this.tags.map((t) =>
          this.countsRefreshQueue.add(async () => {
            await this.refreshTagCount({ id: t.id });

            completedCount++;
            const isComplete = completedCount === totalCount;
            if (isComplete) await this.loadTags();

            if (toastId)
              toast.update(toastId, {
                autoClose: isComplete ? 5000 : false,
                render: `Refreshed ${completedCount} tag counts${isComplete ? "." : "..."}`,
              });
          })
        );
      })
    );
  });

  @modelFlow
  refreshAllTagRelations = _async(function* (this: TagStore) {
    return yield* _await(
      handleErrors(async () => {
        let completedCount = 0;
        const totalCount = this.tags.length;

        const toastId = toast.info(() => `Refreshed ${completedCount} tag relations...`, {
          autoClose: false,
        });

        this.tags.map((t) =>
          this.relationsRefreshQueue.add(async () => {
            await this.refreshTagRelations({ id: t.id });

            completedCount++;
            const isComplete = completedCount === totalCount;
            if (isComplete) await this.loadTags();

            toast.update(toastId, {
              autoClose: isComplete ? 5000 : false,
              render: `Refreshed ${completedCount} tag relations${isComplete ? "." : "..."}`,
            });
          })
        );
      })
    );
  });

  @modelFlow
  refreshTagCount = _async(function* (this: TagStore, { id }: { id: string }) {
    return yield* _await(
      handleErrors(async () => {
        const tagIds = [id, ...this.getParentTags(this.getById(id)).map((t) => t.id)];
        const res = await trpc.recalculateTagCounts.mutate({ tagIds });

        res.data.forEach(({ count, id }) =>
          trpc.onTagUpdated.mutate({ tagId: id, updates: { count } })
        );

        return res.data;
      })
    );
  });

  @modelFlow
  refreshTagRelations = _async(function* (this: TagStore, { id }: { id: string }) {
    return yield* _await(
      handleErrors(async () => {
        const tag = this.getById(id);

        const [childTagsToAdd, childTagsToRemove] = this.getChildTags(tag).reduce(
          (acc, cur) => {
            if (!this.getById(cur.id)) {
              acc[1].push(cur.id);
              return acc;
            }
            if (!cur.parentIds.includes(id)) acc[0].push(cur.id);
            return acc;
          },
          [[], []] as string[][]
        );

        await trpc.addParentTagIdsToTags.mutate({ tagIds: childTagsToAdd, parentTagIds: [id] });
        await trpc.removeParentTagIdsFromTags.mutate({
          tagIds: [id],
          parentTagIds: childTagsToRemove,
        });

        const [parentTagsToAdd, parentTagsToRemove] = this.getParentTags(tag).reduce(
          (acc, cur) => {
            if (!this.getById(cur.id)) {
              acc[1].push(cur.id);
              return acc;
            }
            if (!cur.childIds.includes(id)) acc[0].push(cur.id);
            return acc;
          },
          [[], []] as string[][]
        );

        await trpc.addChildTagIdsToTags.mutate({ tagIds: parentTagsToAdd, childTagIds: [id] });
        await trpc.removeChildTagIdsFromTags.mutate({
          tagIds: [id],
          childTagIds: parentTagsToRemove,
        });

        return { childTagsToAdd, childTagsToRemove, parentTagsToAdd, parentTagsToRemove };
      })
    );
  });

  @modelFlow
  refreshRelatedTagCounts = _async(function* (this: TagStore, { id }: { id: string }) {
    return yield* _await(
      handleErrors(async () => {
        const tag = this.getById(id);
        const relatedTags = [...this.getChildTags(tag, true), ...this.getParentTags(tag)];
        await Promise.all(relatedTags.map((t) => this.refreshTagCount({ id: t.id })));
      })
    );
  });

  /* ----------------------------- DYNAMIC GETTERS ---------------------------- */
  getById(id: string) {
    return this.tags.find((t) => t.id === id);
  }

  getByLabel(label: string) {
    return this.tags.find((t) => t.label.toLowerCase() === label.toLowerCase());
  }

  getChildTags(tag: Tag, recursive = false): Tag[] {
    const childTags = this.listByIds(tag.childIds);
    return (
      recursive ? childTags.flatMap((t) => [t, ...this.getChildTags(t, true)]) : childTags
    ).sort((a, b) => b.count - a.count);
  }

  getParentTags(tag: Tag, recursive = false): Tag[] {
    const parentTags = this.listByIds(tag.parentIds);
    return (
      recursive ? parentTags.flatMap((t) => [t, ...this.getParentTags(t, true)]) : parentTags
    ).sort((a, b) => b.count - a.count);
  }

  listByIds(ids: string[]) {
    return this.tags.filter((t) => ids.includes(t.id));
  }

  listByParentId(id: string) {
    return this.tags.filter((t) => t.parentIds.includes(id));
  }

  /* --------------------------------- GETTERS -------------------------------- */
  @computed
  get activeTag() {
    return this.tags.find((t) => t.id === this.activeTagId);
  }

  @computed
  get tagOptions() {
    return this.tags.map((t) => t.tagOption).sort((a, b) => b.count - a.count);
  }
}
