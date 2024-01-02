import { computed } from "mobx";
import {
  _async,
  _await,
  clone,
  getRootStore,
  model,
  Model,
  modelAction,
  ModelCreationData,
  modelFlow,
  prop,
} from "mobx-keystone";
import * as db from "database";
import { RegExMap, RootStore } from "store";
import { Tag, TagOption, tagsToDescendants } from ".";
import { getArrayDiff, handleErrors, PromiseQueue, regexEscape, trpc } from "utils";
import { toast } from "react-toastify";

const bisectChangedIds = (curIds: string[], newIds?: string[]) =>
  newIds === undefined
    ? [[], []]
    : getArrayDiff(curIds, newIds).reduce(
        (acc, cur) => {
          if (newIds.includes(cur)) acc[0].push(cur);
          else if (curIds.includes(cur)) acc[1].push(cur);
          return acc;
        },
        [[], []] as string[][]
      );

export type TagManagerMode = "create" | "edit" | "search";

@model("mediaViewer/TagStore")
export class TagStore extends Model({
  activeTagId: prop<string>(null).withSetter(),
  isTagEditorOpen: prop<boolean>(false).withSetter(),
  isTagManagerOpen: prop<boolean>(false).withSetter(),
  isTagMergerOpen: prop<boolean>(false).withSetter(),
  tags: prop<Tag[]>(() => []),
}) {
  countsRefreshQueue = new PromiseQueue();
  relationsRefreshQueue = new PromiseQueue();

  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  _addTag = (tag: Tag) => {
    if (!this.getById(tag.id)) this.tags.push(tag);
  };

  @modelAction
  _deleteTag = (id: string) => {
    this.tags = this.tags.reduce((acc, cur) => {
      if (cur.id !== id) {
        if (cur.parentIds.includes(id)) cur.parentIds.splice(cur.parentIds.indexOf(id));
        if (cur.childIds.includes(id)) cur.childIds.splice(cur.childIds.indexOf(id));
        acc.push(cur);
      }
      return acc;
    }, [] as Tag[]);
  };

  @modelAction
  overwrite = (tags: ModelCreationData<Tag>[]) => {
    this.tags = tags.map((t) => new Tag(t));
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
    }: db.CreateTagInput
  ) {
    return yield* _await(
      handleErrors(async () => {
        const res = await trpc.createTag.mutate({ aliases, childIds, label, parentIds });
        if (!res.success) throw new Error(res.error);
        const id = res.data.id;
        const tag = new Tag({
          aliases,
          childIds,
          count: 0,
          dateCreated: res.data.dateCreated,
          dateModified: res.data.dateModified,
          id,
          label,
          parentIds,
        });

        this._addTag(tag);
        await this.refreshTagRelations({ id });
        await this.refreshRelatedTagCounts(tag);
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
        await this.refreshRelatedTagCounts(tag);
      })
    );
  });

  @modelFlow
  editTag = _async(function* (
    this: TagStore,
    { aliases, childIds, id, label, parentIds, withSub = true }: db.EditTagInput
  ) {
    return yield* _await(
      handleErrors(async () => {
        // TODO: Convert this all into an aggregate pipeline
        const tag = this.getById(id);

        const [addedChildIds, removedChildIds] = bisectChangedIds(tag.childIds, childIds);
        const [addedParentIds, removedParentIds] = bisectChangedIds(tag.parentIds, parentIds);

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
        await this.refreshTagCount(id);

        /** TODO:
         *  This is likely the cause of scaling lag on import tag creation.
         *  Group updates in previous steps by id.
         *  Update onTagUpdated to handle multiple tag updates to reduce network overhead. */
        await this.loadTags();
        // if (withSub) trpc.onTagUpdated.mutate({ tagId: id, updates: { aliases, label } });

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
  mergeTags = _async(function* (this: TagStore, args: db.MergeTagsInput) {
    return yield* _await(
      handleErrors(async () => {
        /** Clear import queue first to prevent data corruption from race condition.
         *  Queue is reloaded via socket upon mergeTags resolution.
         */
        const rootStore = getRootStore<RootStore>(this);
        rootStore.importStore.queue.clear();

        const res = await trpc.mergeTags.mutate(args);
        if (!res.success) throw new Error(res.error);
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
            await this.refreshTagCount(t.id);

            completedCount++;
            const isComplete = completedCount === totalCount;
            if (isComplete) await this.loadTags();

            if (toastId)
              toast.update(toastId, {
                autoClose: isComplete ? 5000 : false,
                render: `Refreshed ${completedCount} / ${totalCount} tag counts${
                  isComplete ? "." : "..."
                }`,
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
  refreshTagCount = _async(function* (this: TagStore, id: string, withSub = true) {
    return yield* _await(
      handleErrors(async () => {
        const tag = this.getById(id);
        if (!tag) throw new Error(`[RefreshTagCount] Tag with id '${id}' not found`);

        const res = await trpc.recalculateTagCounts.mutate({ tagId: id });
        if (!res.success) throw new Error(res.error);

        if (withSub)
          res.data.forEach(({ _id, count }) =>
            trpc.onTagUpdated.mutate({ tagId: _id, updates: { count } })
          );

        return res.data;
      })
    );
  });

  @modelFlow
  refreshTagRelations = _async(function* (this: TagStore, { id }: { id: string }) {
    return yield* _await(
      handleErrors(async () => {
        // TODO: Convert this all into an aggregate pipeline
        const tag = this.getById(id);

        const bisectRelatedTags = (tags: Tag[], type: "child" | "parent") =>
          tags.reduce(
            (acc, cur) => {
              if (!this.getById(cur.id)) acc["removed"].push(cur.id);
              else if (!cur[`${type}Ids`].includes(id)) acc["added"].push(cur.id);
              return acc;
            },
            { added: [], removed: [] } as { added: string[]; removed: string[] }
          );

        const { added: childTagsToAdd, removed: childTagsToRemove } = bisectRelatedTags(
          this.getChildTags(tag),
          "parent"
        );

        const { added: parentTagsToAdd, removed: parentTagsToRemove } = bisectRelatedTags(
          this.getParentTags(tag),
          "child"
        );

        await trpc.addParentTagIdsToTags.mutate({ tagIds: childTagsToAdd, parentTagIds: [id] });
        await trpc.removeParentTagIdsFromTags.mutate({
          tagIds: [id],
          parentTagIds: childTagsToRemove,
        });

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
  refreshRelatedTagCounts = _async(function* (this: TagStore, tag: Tag) {
    return yield* _await(
      handleErrors(async () => {
        const relatedTags = [...this.getChildTags(tag, true), ...this.getParentTags(tag, true)];
        await Promise.all(relatedTags.map((t) => this.refreshTagCount(t.id)));
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
