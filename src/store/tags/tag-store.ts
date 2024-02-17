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
import * as db from "database";
import { RootStore } from "store";
import { SortMenuProps } from "components";
import { Tag, TagOption } from ".";
import { dayjs, handleErrors, PromiseQueue, regexEscape, trpc } from "utils";
import { toast } from "react-toastify";

export type TagManagerMode = "create" | "edit" | "search";

@model("mediaViewer/TagStore")
export class TagStore extends Model({
  activeTagId: prop<string>(null).withSetter(),
  isTagEditorOpen: prop<boolean>(false).withSetter(),
  isTaggerOpen: prop<boolean>(false).withSetter(),
  isTagManagerOpen: prop<boolean>(false).withSetter(),
  isTagMergerOpen: prop<boolean>(false).withSetter(),
  isTagSubEditorOpen: prop<boolean>(false).withSetter(),
  regExSearch: prop<{ regEx: string; tagOpts: TagOption[] }>(() => ({
    regEx: "",
    tagOpts: [],
  })),
  subEditorTagId: prop<string>(null).withSetter(),
  taggerBatchId: prop<string | null>(null).withSetter(),
  taggerFileIds: prop<string[]>(() => []).withSetter(),
  tagManagerRegExMode: prop<"any" | "hasRegEx" | "hasNoRegEx">("any").withSetter(),
  tagManagerSort: prop<SortMenuProps["value"]>(() => ({
    isDesc: true,
    key: "dateCreated",
  })).withSetter(),
  tags: prop<Tag[]>(() => []),
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

  @modelAction
  toggleTagManagerRegExMode = () => {
    this.tagManagerRegExMode =
      this.tagManagerRegExMode === "any"
        ? "hasRegEx"
        : this.tagManagerRegExMode === "hasRegEx"
        ? "hasNoRegEx"
        : "any";
  };

  @modelAction
  updateRegExSearch = (search: Partial<TagStore["regExSearch"]>) => {
    this.regExSearch = { ...this.regExSearch, ...search };
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
      regExMap,
      withRegEx = false,
      withSub = true,
    }: db.CreateTagInput & { withRegEx?: boolean }
  ) {
    return yield* _await(
      handleErrors(async () => {
        const res = await trpc.createTag.mutate({ aliases, childIds, label, parentIds, withSub });
        if (!res.success) throw new Error(res.error);
        const id = res.data.id;

        const tag: ModelCreationData<Tag> = {
          aliases,
          childIds,
          count: 0,
          dateCreated: res.data.dateCreated,
          dateModified: res.data.dateModified,
          id,
          label,
          parentIds,
          regExMap: withRegEx
            ? {
                regEx: regExMap?.regEx || this.tagsToRegEx([{ aliases, label }]),
                testString: regExMap?.testString || "",
                types: regExMap?.types || ["diffusionParams", "fileName", "folderName"],
              }
            : null,
        };

        toast.success(`Tag '${label}' created${withRegEx ? " with RegEx map" : ""}`);

        return tag;
      })
    );
  });

  @modelFlow
  deleteTag = _async(function* (this: TagStore, { id }: { id: string }) {
    return yield* _await(
      handleErrors(async () => {
        await trpc.deleteTag.mutate({ id });
      })
    );
  });

  @modelFlow
  editTag = _async(function* (
    this: TagStore,
    { aliases, childIds, id, label, parentIds, regExMap, withSub = true }: db.EditTagInput
  ) {
    return yield* _await(
      handleErrors(async () => {
        const origTag = this.getById(id);
        const origLabel = origTag.label;
        const origParentIds = [...this.getParentTags(origTag)].map((t) => t.id);

        const editRes = await trpc.editTag.mutate({
          aliases,
          childIds,
          id,
          label,
          parentIds,
          regExMap,
          withSub,
        });
        if (!editRes.success) throw new Error(editRes.error);

        const countRes = await this.refreshTagCounts([...origParentIds, id], withSub);
        if (!countRes.success) throw new Error(countRes.error);

        toast.success(`Tag '${origLabel}' edited`);
      })
    );
  });

  @modelFlow
  loadTags = _async(function* (this: TagStore) {
    return yield* _await(
      handleErrors(async () => {
        const res = await trpc.listTags.mutate();
        if (!res.success) throw new Error(res.error);
        this.overwrite(res.data);
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
            await this.refreshTagCounts([t.id]);

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
  refreshTagCounts = _async(function* (this: TagStore, tagIds: string[], withSub: boolean = true) {
    return yield* _await(
      handleErrors(async () => {
        const res = await trpc.recalculateTagCounts.mutate({ tagIds, withSub });
        if (!res.success) throw new Error(res.error);
        return res.data;
      })
    );
  });

  @modelFlow
  refreshTagRelations = _async(function* (this: TagStore, { id }: { id: string }) {
    return yield* _await(
      handleErrors(async () => {
        const tag = this.getById(id);

        const bisectRelatedTags = (type: "child" | "parent", tags: Tag[]) =>
          tags.reduce(
            (acc, cur) => {
              if (!this.getById(cur.id)) acc["removed"].push(cur.id);
              else if (!cur[`${type === "child" ? "parent" : "child"}Ids`].includes(id))
                acc["added"].push(cur.id);
              return acc;
            },
            { added: [], removed: [] } as { added: string[]; removed: string[] }
          );

        const changedChildIds = bisectRelatedTags("child", this.getChildTags(tag));
        const changedParentIds = bisectRelatedTags("parent", this.getParentTags(tag));
        const dateModified = dayjs().toISOString();

        const res = await trpc.refreshTagRelations.mutate({
          changedChildIds,
          changedParentIds,
          dateModified,
          tagId: id,
        });
        if (!res.success) throw new Error(res.error);

        return { changedChildIds, changedParentIds, dateModified };
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
    const idsSet = new Set(ids.map(String));
    return this.tags.filter((t) => idsSet.has(t.id));
  }

  listByParentId(id: string) {
    return this.tags.filter((t) => t.parentIds.includes(id));
  }

  listRegExMapsByType(type: db.RegExMapType) {
    return this.tags.reduce((acc, cur) => {
      if (cur.regExMap?.types.includes(type)) acc.push({ ...cur.regExMap, tagId: cur.id });
      return acc;
    }, [] as Array<db.RegExMap & { tagId: string }>);
  }

  tagsToRegEx(tags: { aliases?: string[]; label: string }[]) {
    return `(${tags
      .flatMap((tag) => [tag.label, ...tag.aliases])
      .map((s) => `\\b${regexEscape(s).replaceAll(/[\s-_]+/g, "[\\s\\-_\\.]+")}\\b`)
      .join(")|(")})`;
  }

  tagSearchOptsToIds(options: TagOption[], withDescArrays = false) {
    return options.reduce(
      (acc, cur) => {
        if (cur.searchType.includes("Desc")) {
          const childTagIds = withDescArrays
            ? this.getChildTags(this.getById(cur.id), true).map((t) => t.id)
            : [];
          const tagIds = [cur.id, ...childTagIds];
          if (cur.searchType === "excludeDesc") {
            acc["excludedDescTagIds"].push(cur.id);
            if (withDescArrays) acc["excludedDescTagIdArrays"].push(tagIds);
          } else if (cur.searchType === "includeDesc") {
            acc["requiredDescTagIds"].push(cur.id);
            if (withDescArrays) acc["requiredDescTagIdArrays"].push(tagIds);
          }
        } else if (cur.searchType === "includeAnd") acc["requiredTagIds"].push(cur.id);
        else if (cur.searchType === "includeOr") acc["optionalTagIds"].push(cur.id);
        else if (cur.searchType === "exclude") acc["excludedTagIds"].push(cur.id);
        return acc;
      },
      {
        excludedTagIds: [],
        excludedDescTagIds: [],
        excludedDescTagIdArrays: [],
        optionalTagIds: [],
        requiredTagIds: [],
        requiredDescTagIds: [],
        requiredDescTagIdArrays: [],
      } as {
        excludedTagIds: string[];
        excludedDescTagIds: string[];
        excludedDescTagIdArrays: string[][];
        optionalTagIds: string[];
        requiredTagIds: string[];
        requiredDescTagIds: string[];
        requiredDescTagIdArrays: string[][];
      }
    );
  }

  /* --------------------------------- GETTERS -------------------------------- */
  @computed
  get tagOptions() {
    return this.tags.map((t) => t.tagOption).sort((a, b) => b.count - a.count);
  }
}
