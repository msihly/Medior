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
import { RootStore } from "store";
import { CreateTagInput, EditTagInput } from "database";
import { getTagDescendants, Tag } from ".";
import { getArrayDiff, handleErrors, PromiseQueue, trpc } from "utils";
import { toast } from "react-toastify";

export type TagOption = {
  aliases?: string[];
  count: number;
  id: string;
  label?: string;
};

export const TagCountsRefreshQueue = new PromiseQueue();
export const TagRelationsRefreshQueue = new PromiseQueue();

@model("mediaViewer/TagStore")
export class TagStore extends Model({
  activeTagId: prop<string>(null).withSetter(),
  isTagManagerOpen: prop<boolean>(false).withSetter(),
  tags: prop<Tag[]>(() => []),
  tagManagerMode: prop<"create" | "edit" | "search">("search").withSetter(),
}) {
  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  _addTag = (tag: ModelCreationData<Tag>) => this.tags.push(new Tag(tag));

  @modelAction
  _deleteTag = (id: string) => {
    this.tags.forEach((t) => {
      if (t.parentIds.includes(id)) t.parentIds.splice(t.parentIds.indexOf(id));
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
    { aliases = [], childIds = [], label, parentIds = [] }: CreateTagInput
  ) {
    return yield* _await(
      handleErrors(async () => {
        const res = await trpc.createTag.mutate({ aliases, childIds, label, parentIds });
        if (!res.success) throw new Error(res.error);
        const tag = res.data;

        this._addTag(tag);

        await this.refreshTagRelations({ id: tag.id });
        await this.refreshRelatedTagCounts({ id: tag.id });
        this.overwrite((await trpc.listTags.mutate())?.data);

        toast.success(`Tag '${label}' created`);
        return tag;
      })
    );
  });

  @modelFlow
  deleteTag = _async(function* (
    this: TagStore,
    { id, rootStore }: { id: string; rootStore: RootStore }
  ) {
    return yield* _await(
      handleErrors(async () => {
        await trpc.removeTagFromAllFiles.mutate({ tagId: id });
        await trpc.removeTagFromAllBatches.mutate({ tagId: id });
        rootStore.importStore.editBatchTags({ removedIds: [id] });

        await trpc.removeTagFromAllChildTags.mutate({ tagId: id });
        await trpc.removeTagFromAllParentTags.mutate({ tagId: id });

        await this.refreshRelatedTagCounts({ id });

        await trpc.deleteTag.mutate({ id });

        this._deleteTag(id);
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
        await this.refreshTagCount({ id, withRelated: true });
        this.overwrite((await trpc.listTags.mutate())?.data);

        toast.success("Tag edited");
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
          TagCountsRefreshQueue.add(async () => {
            await this.refreshTagCount({ id: t.id });

            completedCount++;
            const isComplete = completedCount === totalCount;
            if (isComplete) this.overwrite((await trpc.listTags.mutate())?.data);

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
          TagRelationsRefreshQueue.add(async () => {
            await this.refreshTagRelations({ id: t.id });

            completedCount++;
            const isComplete = completedCount === totalCount;
            if (isComplete) this.overwrite((await trpc.listTags.mutate())?.data);

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
  refreshTagCount = _async(function* (
    this: TagStore,
    { id, withRelated = false }: { id: string; withRelated?: boolean }
  ) {
    return yield* _await(
      handleErrors(async () => {
        const tag = this.getById(id);
        const descendants = getTagDescendants(this, tag);
        const filesRes = await trpc.listFilesByTagIds.mutate({ tagIds: [id, ...descendants] });
        const count = filesRes.data.length;

        await trpc.setTagCount.mutate({ id, count });
        tag.update({ count });
        if (withRelated) await this.refreshRelatedTagCounts({ id });

        return count;
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
        const relatedTags = [...this.getChildTags(tag, true), ...this.getParentTags(tag, true)];
        await Promise.all(
          relatedTags.map(async (t) => {
            const count = (await this.refreshTagCount({ id }))?.data;
            t.update({ count });
          })
        );
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

  getChildTags(tag: Tag, recursive = false) {
    const childTags = this.listByIds(tag.childIds);
    return recursive ? childTags.flatMap((t) => [t, ...this.getChildTags(t, true)]) : childTags;
  }

  getParentTags(tag: Tag, recursive = false) {
    const parentTags = this.listByIds(tag.parentIds);
    return recursive ? parentTags.flatMap((t) => [t, ...this.getParentTags(t, true)]) : parentTags;
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
