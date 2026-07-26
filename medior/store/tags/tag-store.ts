import autoBind from "auto-bind";
import { Model, model, modelFlow, prop } from "mobx-keystone";
import * as db from "medior/server/database";
import { TagToUpsert } from "medior/components";
import { asyncAction, toast } from "medior/utils/client";
import { PromiseQueue, tagsToRegEx } from "medior/utils/common";
import { trpc } from "medior/utils/server";
import { TagEditorStore, TagManagerStore, TagMergerStore, TagOption } from ".";

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
      aliases,
      label,
      regEx,
      withRegen = false,
      withRegEx = false,
      withSub = true,
      ...tag
    }: db.CreateTagInput & { withRegEx?: boolean }) => {
      regEx = regEx || withRegEx ? tagsToRegEx([{ aliases, label }]) : null;

      const res = await trpc.createTag.mutate({
        ...tag,
        aliases,
        label,
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
  editTag = asyncAction(async ({ withSub = true, ...tag }: db.EditTagInput) => {
    const editRes = await trpc.editTag.mutate({ ...tag, withSub });
    if (!editRes.success) throw new Error(editRes.error);
  });

  @modelFlow
  getByLabel = asyncAction(async (label: string) => {
    if (!label) throw new Error("No label provided");
    const res = await trpc.listTag.mutate({ filter: { label: { $in: [label] } } });
    if (!res.success) throw new Error(res.error);
    return res.data?.[0];
  });

  @modelFlow
  listByIds = asyncAction(async ({ ids }: { ids: string[] }) => {
    const res = await trpc.listTag.mutate({ filter: { id: ids } });
    if (!res.success) throw new Error(res.error);
    return res.data;
  });

  @modelFlow
  listByLabels = asyncAction(async (labels: string[]) => {
    if (!labels?.length) throw new Error("No labels provided");
    const res = await trpc.listTag.mutate({ filter: { label: { $in: labels } } });
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
    const tagQueue = new PromiseQueue();
    const errors: string[] = [];
    const upsertedTags: { id: string; label: string; parentIds: string[] }[] = [];

    tagsToUpsert.forEach((t) =>
      tagQueue.add(async () => {
        try {
          const res = await trpc.upsertTag.mutate({
            aliases: t.aliases?.length ? [...t.aliases] : [],
            label: t.label,
            parentLabels: t.parentLabels?.length ? [...t.parentLabels] : [],
            withRegEx: t.withRegEx,
          });
          if (!res.success) throw new Error(res.error);
          upsertedTags.push(res.data);
        } catch (err) {
          errors.push(`Tag: ${JSON.stringify(t, null, 2)}\nError: ${err.message}`);
        }
      }),
    );

    await tagQueue.resolve();
    if (errors.length) throw new Error(errors.join("\n"));

    const tagIds = upsertedTags.map((tag) => tag.id);
    trpc.regenTags.mutate({ tagIds, withSub: true }).then((res) => {
      if (!res.success) console.error(res.error);
    });

    return upsertedTags;
  });

  /* ----------------------------- DYNAMIC GETTERS ---------------------------- */
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
