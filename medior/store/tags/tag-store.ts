import autoBind from "auto-bind";
import { getRootStore, Model, model, ModelCreationData, modelFlow, prop } from "mobx-keystone";
import * as db from "medior/server/database";
import { TagToUpsert } from "medior/components";
import { asyncAction, RootStore } from "medior/store";
import { toast } from "medior/utils/client";
import { PromiseChain, regexEscape } from "medior/utils/common";
import { trpc } from "medior/utils/server";
import { Tag, TagEditorStore, TagManagerStore, TagMergerStore, TagOption } from ".";

@model("medior/TagStore")
export class TagStore extends Model({
  editor: prop<TagEditorStore>(() => new TagEditorStore({})),
  manager: prop<TagManagerStore>(() => new TagManagerStore({})),
  merger: prop<TagMergerStore>(() => new TagMergerStore({})),
  subEditor: prop<TagEditorStore>(() => new TagEditorStore({})),
}) {
  onInit() {
    autoBind(this);
  }

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  createTag = asyncAction(
    async ({
      aliases = [],
      childIds = [],
      label,
      parentIds = [],
      regEx,
      withRegen = false,
      withRegEx = false,
      withSub = true,
    }: db.CreateTagInput & { withRegEx?: boolean }) => {
      regEx = regEx || withRegEx ? this.tagsToRegEx([{ aliases, label }]) : null;

      const res = await trpc.createTag.mutate({
        aliases,
        childIds,
        label,
        parentIds,
        regEx,
        withRegen,
        withSub,
      });
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
  );

  @modelFlow
  deleteTag = asyncAction(async ({ id }: { id: string }) => {
    await trpc.deleteTag.mutate({ id });
  });

  @modelFlow
  editTag = asyncAction(
    async ({ aliases, childIds, id, label, parentIds, regEx, withSub = true }: db.EditTagInput) => {
      const editRes = await trpc.editTag.mutate({
        aliases,
        childIds,
        id,
        label,
        parentIds,
        regEx,
        withSub,
      });
      if (!editRes.success) throw new Error(editRes.error);
      toast.success(`Tag edited`);
    },
  );

  @modelFlow
  getByLabel = asyncAction(async (label: string) => {
    const res = await trpc.listTagsByLabels.mutate({ labels: [label] });
    if (!res.success) throw new Error(res.error);
    return res.data?.get?.(label);
  });

  @modelFlow
  listByIds = asyncAction(async ({ ids }: { ids: string[] }) => {
    const res = await trpc.listTag.mutate({ args: { filter: { id: ids } } });
    if (!res.success) throw new Error(res.error);
    return res.data;
  });

  @modelFlow
  listByLabels = asyncAction(async (labels: string[]) => {
    const res = await trpc.listTagsByLabels.mutate({ labels });
    if (!res.success) throw new Error(res.error);
    return res.data;
  });

  @modelFlow
  listRegExMaps = asyncAction(async () => {
    const res = await trpc.listRegExMaps.mutate();
    if (!res.success) throw new Error(res.error);
    return res.data.map((t) => ({ regEx: new RegExp(t.regEx, "im"), tagId: t.id }));
  });

  @modelFlow
  listTagAncestorLabels = asyncAction(async ({ id }: { id: string }) => {
    const res = await trpc.listTagAncestorLabels.mutate({ id });
    if (!res.success) throw new Error(res.error);
    return res.data;
  });

  @modelFlow
  mergeTags = asyncAction(async (args: db.MergeTagsInput) => {
    /** Clear import queue first to prevent data corruption from race condition.
     *  Queue is reloaded via socket upon mergeTags resolution.
     */
    const stores = getRootStore<RootStore>(this);
    stores.import.manager.clearQueue();

    const res = await trpc.mergeTags.mutate(args);
    if (!res.success) throw new Error(res.error);
  });

  @modelFlow
  refreshTag = asyncAction(async ({ id }: { id: string }) => {
    const res = await trpc.refreshTag.mutate({ tagId: id });
    if (!res.success) throw new Error(res.error);
    toast.success("Tag refreshed");
  });

  @modelFlow
  upsertTags = asyncAction(async (tagsToUpsert: TagToUpsert[]) => {
    const tagQueue = new PromiseChain();
    const errors: string[] = [];
    const tagIds: string[] = [];
    const tagsToInsert: Map<string, ModelCreationData<Tag>> = new Map();

    tagsToUpsert.forEach((t) =>
      tagQueue.add(async () => {
        try {
          const parentTagsMap = (await trpc.listTagsByLabels.mutate({ labels: t.parentLabels }))
            .data;
          const parentTags: ModelCreationData<Tag>[] = [];
          if (t.parentLabels?.length) {
            for (const label of t.parentLabels) {
              if (parentTagsMap.has(label)) parentTags.push(parentTagsMap.get(label));
              else if (tagsToInsert.has(label)) parentTags.push(tagsToInsert.get(label));
            }
          }
          const parentIds = parentTags?.map((t) => t.id) ?? [];

          if (t.id) {
            const tag = (await this.listByIds({ ids: [t.id] })).data?.items?.[0];
            if (!parentIds.length || tag.parentIds.some((id) => parentIds.includes(id))) return;

            const res = await this.editTag({
              id: t.id,
              parentIds: parentIds.length ? [...tag.parentIds, ...parentIds] : [],
              withRegen: false,
              withSub: false,
            });
            if (!res.success) throw new Error(res.error);

            tagIds.push(t.id);
          } else {
            const res = await this.createTag({
              aliases: t.aliases?.length ? [...t.aliases] : [],
              label: t.label,
              parentIds,
              withRegEx: t.withRegEx,
              withSub: false,
            });
            if (!res.success) throw new Error(res.error);

            tagIds.push(res.data.id);
            tagsToInsert.set(res.data.label, res.data);
          }
        } catch (err) {
          errors.push(`Tag: ${JSON.stringify(t, null, 2)}\nError: ${err.message}`);
        }
      }),
    );

    await tagQueue.queue;
    if (errors.length) throw new Error(errors.join("\n"));

    const regenRes = await trpc.regenTags.mutate({ tagIds, withSub: true });
    if (!regenRes.success) throw new Error(regenRes.error);

    return tagIds;
  });

  /* ----------------------------- DYNAMIC GETTERS ---------------------------- */
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
          const childTagIds = withDescArrays ? cur.descendantIds : [];
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
      },
    );
  }
}
