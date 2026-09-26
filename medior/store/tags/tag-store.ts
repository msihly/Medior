import autoBind from "auto-bind";
import type { TagSchema } from "medior/_generated/server/models";
import { Model, model, modelAction, modelFlow, objectToMapTransform, prop } from "mobx-keystone";
import * as db from "medior/server/database";
import { TagToUpsert } from "medior/components";
import { asyncAction, toast } from "medior/utils/client";
import {
  Fmt,
  mergeTagDefinitions,
  resolveTagCategory,
  TagCategorySource,
  tagsToRegEx,
} from "medior/utils/common";
import { trpc } from "medior/utils/server";
import { TagEditorStore, TagManagerStore, TagMergerStore, TagOption } from ".";

@model("medior/TagStore")
export class TagStore extends Model({
  categorySources: prop<Record<string, TagCategorySource>>(() => ({}))
    .withTransform(objectToMapTransform<TagCategorySource>())
    .withSetter(),
  editor: prop<TagEditorStore>(() => new TagEditorStore({})),
  manager: prop<TagManagerStore>(() => new TagManagerStore({})),
  merger: prop<TagMergerStore>(() => new TagMergerStore({})),
  subEditor: prop<TagEditorStore>(() => new TagEditorStore({})),
}) {
  private categoryLoad: Promise<void> = null;
  private categoryRevision = 0;

  onInit() {
    autoBind(this);
  }

  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  updateCategorySources(tags: { tagId: string; updates: Partial<TagSchema> }[]) {
    for (const { tagId, updates } of tags) {
      if (!("category" in updates) && !("parentIds" in updates)) continue;

      this.categoryRevision++;
      const current = this.categorySources.get(tagId);
      const category = "category" in updates ? updates.category : current?.category;
      this.categorySources.set(tagId, {
        category: category ? { ...category } : null,
        id: tagId,
        parentIds: [...(updates.parentIds ?? current?.parentIds ?? [])],
      });
    }
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
      regEx = regEx || (withRegEx ? tagsToRegEx([{ aliases, label }]) : null);

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

    const res = await trpc.listTag.mutate({
      filter: { label: { $options: "i", $regex: `^${Fmt.regexEscape(label)}$` } },
    });
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

    const res = await trpc.listTag.mutate({
      filter: {
        $or: labels.map((label) => ({
          label: { $options: "i", $regex: `^${Fmt.regexEscape(label)}$` },
        })),
      },
    });
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
  loadCategorySources = asyncAction(async () => {
    this.categoryRevision++;
    if (this.categoryLoad) return this.categoryLoad;

    this.categoryLoad = (async () => {
      let revision: number;

      do {
        revision = this.categoryRevision;
        const res = await trpc.listTagCategories.mutate();
        if (!res.success) throw new Error(res.error);
        if (revision !== this.categoryRevision) continue;

        this.setCategorySources(new Map(res.data.map((tag) => [tag.id, tag])));
      } while (revision !== this.categoryRevision);
    })();

    try {
      await this.categoryLoad;
    } finally {
      this.categoryLoad = null;
    }
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
  updateTagRating = asyncAction(async ({ id, rating }: { id: string; rating: number }) => {
    this.manager.setIsLoading(true);

    const res = await trpc.editTag.mutate({
      id,
      rating,
      ratingIsManual: rating > 0,
    });
    this.manager.setIsLoading(false);
    if (!res.success) throw new Error(res.error);
  });

  @modelFlow
  upsertTags = asyncAction(
    async ({
      tagsToUpsert,
      onProgress,
    }: {
      onProgress?: (completed: number, total: number) => void;
      tagsToUpsert: TagToUpsert[];
    }) => {
      const upsertedTags: { id: string; label: string; parentIds: string[] }[] = [];
      tagsToUpsert = mergeTagDefinitions(tagsToUpsert);

      for (let idx = 0; idx < tagsToUpsert.length; idx += 256) {
        onProgress?.(idx, tagsToUpsert.length);

        const batch = tagsToUpsert.slice(idx, idx + 256);

        const res = await trpc.upsertImportTags.mutate(
          batch.map((t) => ({
            aliases: t.aliases?.length ? [...t.aliases] : [],
            category: t.category,
            label: t.label,
            parentLabels: t.parentLabels?.length ? [...t.parentLabels] : [],
            withRegEx: t.withRegEx,
          })),
        );
        if (!res.success) throw new Error(res.error);

        upsertedTags.push(...res.data);
        onProgress?.(idx + batch.length, tagsToUpsert.length);
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }

      return upsertedTags;
    },
  );

  /* ----------------------------- DYNAMIC GETTERS ---------------------------- */
  getCategory(tag: { category?: TagSchema["category"]; id?: string }) {
    const source = this.categorySources.get(tag?.id);
    return source ? resolveTagCategory(source, this.categorySources) : tag?.category;
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
        excludedDescTagIdArrays: [],
        excludedDescTagIds: [],
        excludedTagIds: [],
        optionalTagIds: [],
        requiredDescTagIdArrays: [],
        requiredDescTagIds: [],
        requiredTagIds: [],
      } as {
        excludedDescTagIdArrays: string[][];
        excludedDescTagIds: string[];
        excludedTagIds: string[];
        optionalTagIds: string[];
        requiredDescTagIdArrays: string[][];
        requiredDescTagIds: string[];
        requiredTagIds: string[];
      },
    );
  }
}
