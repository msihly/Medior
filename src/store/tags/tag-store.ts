import { computed } from "mobx";
import {
  _async,
  _await,
  getRootStore,
  model,
  Model,
  modelAction,
  ModelCreationData,
  modelFlow,
  prop,
} from "mobx-keystone";
import { CreateTagInput, EditTagInput } from "database";
import { RegExMap, RootStore } from "store";
import { Tag, TagOption, tagsToDescendants } from ".";
import { getArrayDiff, handleErrors, PromiseQueue, regexEscape, trpc } from "utils";
import { toast } from "react-toastify";

export type TagManagerMode = "create" | "edit" | "search";

@model("mediaViewer/TagStore")
export class TagStore extends Model({
  activeTagId: prop<string>(null).withSetter(),
  isTagManagerOpen: prop<boolean>(false).withSetter(),
  tags: prop<Tag[]>(() => []),
  tagManagerMode: prop<TagManagerMode>("search"),
  tagManagerPrevMode: prop<TagManagerMode>("search"),
}) {
  countsRefreshQueue = new PromiseQueue();
  relationsRefreshQueue = new PromiseQueue();

  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  _addTag = (tag: ModelCreationData<Tag>) => {
    if (!this.getById(tag.id)) this.tags.push(new Tag(tag));
  };

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

  @modelAction
  setTagManagerMode = (mode: TagManagerMode) => {
    this.tagManagerPrevMode = this.tagManagerMode;
    this.tagManagerMode = mode;
  };

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  createTag = _async(function* (
    this: TagStore,
    {
      aliases = [],
      childIds = [],
      label,
      parentIds = [],
      withRegEx = false,
      withSub = true,
    }: CreateTagInput
  ) {
    return yield* _await(
      handleErrors(async () => {
        const res = await trpc.createTag.mutate({ aliases, childIds, label, parentIds });
        if (!res.success) throw new Error(res.error);
        const id = res.data.id;
        const tag = {
          aliases,
          childIds,
          count: 0,
          dateCreated: res.data.dateCreated,
          dateModified: res.data.dateModified,
          id,
          label,
          parentIds,
        };

        this._addTag(tag);
        await this.refreshTagRelations({ id });
        await this.refreshRelatedTagCounts({ id });
        toast.success(`Tag '${label}' created`);

        if (withRegEx) {
          const regExMap: ModelCreationData<RegExMap> = {
            regEx: this.tagsToRegEx([tag]),
            tagIds: [id],
            testString: label,
            types: ["diffusionParams", "fileName", "folderName"],
          };

          const res = await trpc.createRegExMaps.mutate({ regExMaps: [regExMap] });
          toast.success(`RegEx map for '${label}' created`);

          const rootStore = getRootStore<RootStore>(this);
          rootStore.importStore._addRegExMap({ ...regExMap, id: res.data[0]._id.toString() });
        }

        if (withSub) trpc.onTagCreated.mutate({ tag });
        return tag;
      })
    );
  });

  @modelFlow
  deleteTag = _async(function* (this: TagStore, { id }: { id: string }) {
    return yield* _await(
      handleErrors(async () => {
        const tag = clone(this.getById(id));
        await trpc.deleteTag.mutate({ id });
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

        const [addedChildIds, removedChildIds] =
          childIds === undefined
            ? [[], []]
            : getArrayDiff(tag.childIds, childIds).reduce(
                (acc, cur) => {
                  if (childIds.includes(cur)) acc[0].push(cur);
                  else if (tag.childIds.includes(cur)) acc[1].push(cur);
                  return acc;
                },
                [[], []] as string[][]
              );

        const [addedParentIds, removedParentIds] =
          parentIds === undefined
            ? [[], []]
            : getArrayDiff(tag.parentIds, parentIds).reduce(
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

        toast.success(`Tag '${tag.label}' edited`);
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
        const tag = this.getById(id);
        if (!tag) {
          console.error(`[RefreshTagCount] Tag with id '${id}' not found`);
          return null;
        }

        const tagIds = [id, ...this.getParentTags(tag).map((t) => t.id)];
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

  tagsToRegEx(tags: { aliases?: string[]; label: string }[]) {
    return `(${tags
      .flatMap((tag) => [tag.label, ...tag.aliases])
      .map((s) => `\\b${regexEscape(s).replaceAll(/[\s-_]+/g, "[\\s\\-_\\.]+")}\\b`)
      .join(")|(")})`;
  }

  tagSearchOptsToIds(options: TagOption[]) {
    const [excludedAnyTagIds, includedAnyTagIds, includedAllTagIds] = options.reduce(
      (acc, cur) => {
        if (cur.searchType === "exclude") acc[0].push(cur.id);
        else if (cur.searchType === "excludeDesc") acc[0].push(...this.tagOptsToIds([cur], true));
        else if (cur.searchType === "includeOr") acc[1].push(cur.id);
        else if (cur.searchType === "includeDesc") acc[1].push(...this.tagOptsToIds([cur], true));
        else if (cur.searchType === "includeAnd") acc[2].push(cur.id);
        return acc;
      },
      [[], [], []] as string[][]
    );

    return { excludedAnyTagIds, includedAllTagIds, includedAnyTagIds };
  }

  tagOptsToIds(opts: TagOption[], withDesc = false) {
    const tagIds = opts.map((t) => t.id);
    return [...tagIds, ...(withDesc ? tagsToDescendants(this, this.listByIds(tagIds)) : [])];
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
