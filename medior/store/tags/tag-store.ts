import * as db from "medior/database";
import {
  getRootStore,
  model,
  Model,
  modelAction,
  ModelCreationData,
  modelFlow,
  prop,
} from "mobx-keystone";
import { computed } from "mobx";
import { TagToUpsert } from "medior/components";
import { asyncAction, RootStore } from "medior/store";
import { Tag, TagManagerStore, TagOption } from ".";
import { PromiseQueue, regexEscape, trpc } from "medior/utils";
import { toast } from "react-toastify";

@model("medior/TagStore")
export class TagStore extends Model({
  activeTagId: prop<string>(null).withSetter(),
  fileTagEditorBatchId: prop<string | null>(null).withSetter(),
  fileTagEditorFileIds: prop<string[]>(() => []).withSetter(),
  isFileTagEditorOpen: prop<boolean>(false).withSetter(),
  isTagEditorOpen: prop<boolean>(false).withSetter(),
  isTagMergerOpen: prop<boolean>(false).withSetter(),
  isTagSubEditorOpen: prop<boolean>(false).withSetter(),
  manager: prop<TagManagerStore>(() => new TagManagerStore({})),
  subEditorTagId: prop<string>(null).withSetter(),
  tags: prop<Tag[]>(() => []),
}) {
  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  _addTag(tag: ModelCreationData<Tag>) {
    if (!this.getById(tag.id)) this.tags.push(new Tag(tag));
  }

  @modelAction
  _deleteTag(id: string) {
    this.tags = this.tags.reduce((acc, cur) => {
      if (cur.id !== id) {
        if (cur.parentIds.includes(id)) cur.parentIds.splice(cur.parentIds.indexOf(id));
        if (cur.childIds.includes(id)) cur.childIds.splice(cur.childIds.indexOf(id));
        acc.push(cur);
      }
      return acc;
    }, [] as Tag[]);
  }

  @modelAction
  overwrite(tags: ModelCreationData<Tag>[]) {
    this.tags = tags.map((t) => new Tag(t));
  }

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  createTag = asyncAction(
    async ({
      aliases = [],
      childIds = [],
      label,
      parentIds = [],
      regExMap,
      withRegEx = false,
      withSub = true,
    }: db.CreateTagInput & { withRegEx?: boolean }) => {
      const regEx =
        regExMap || withRegEx
          ? {
              regEx: regExMap?.regEx || this.tagsToRegEx([{ aliases, label }]),
              testString: regExMap?.testString || "",
              types: regExMap?.types || ["diffusionParams", "fileName", "folderName"],
            }
          : null;

      const res = await trpc.createTag.mutate({
        aliases,
        childIds,
        label,
        parentIds,
        regExMap: regEx,
        withSub,
      });
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
        regExMap: regEx,
        thumbPaths: [],
      };

      if (withSub) this._addTag(tag);
      toast.success(`Tag '${label}' created`);

      return tag;
    }
  );

  @modelFlow
  deleteTag = asyncAction(async ({ id }: { id: string }) => {
    await trpc.deleteTag.mutate({ id });
  });

  @modelFlow
  editTag = asyncAction(
    async ({
      aliases,
      childIds,
      id,
      label,
      parentIds,
      regExMap,
      withSub = true,
    }: db.EditTagInput) => {
      const origLabel = this.getById(id).label;

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

      toast.success(`Tag '${origLabel}' edited`);
    }
  );

  @modelFlow
  loadTags = asyncAction(async () => {
    const res = await trpc.listTags.mutate();
    if (!res.success) throw new Error(res.error);
    this.overwrite(res.data);
  });

  @modelFlow
  mergeTags = asyncAction(async (args: db.MergeTagsInput) => {
    /** Clear import queue first to prevent data corruption from race condition.
     *  Queue is reloaded via socket upon mergeTags resolution.
     */
    const stores = getRootStore<RootStore>(this);
    stores.import.queue.clear();

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
    const tagIds: string[] = [];
    const tagsToInsert: ModelCreationData<Tag>[] = [];

    tagsToUpsert.forEach((t) =>
      tagQueue.add(async () => {
        try {
          const parentTags = t.parentLabels
            ? t.parentLabels
                .map((l) => this.getByLabel(l) || tagsToInsert.find((tag) => tag.label === l))
                .filter(Boolean)
            : null;
          const parentIds = parentTags?.map((t) => t.id) ?? [];

          if (t.id) {
            const tag = this.getById(t.id);
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
            tagsToInsert.push(res.data);
          }
        } catch (err) {
          errors.push(`Tag: ${JSON.stringify(t, null, 2)}\nError: ${err.message}`);
        }
      })
    );

    await tagQueue.queue;
    if (tagsToInsert.length) tagsToInsert.forEach((t) => this._addTag(t));
    if (errors.length) throw new Error(errors.join("\n"));

    const regenRes = await trpc.regenTags.mutate({ tagIds, withSub: true });
    if (!regenRes.success) throw new Error(regenRes.error);

    return tagIds;
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

  listRegExMapsByType(type: db.RegExMapSchema["types"][number]) {
    return this.tags.reduce(
      (acc, cur) => {
        if (cur.regExMap?.types.includes(type)) acc.push({ ...cur.regExMap, tagId: cur.id });
        return acc;
      },
      [] as Array<db.RegExMapSchema & { tagId: string }>
    );
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
        const tag = this.getById(cur.id);
        if (!tag) return acc;

        if (cur.searchType.includes("Desc")) {
          const childTagIds = withDescArrays ? this.getChildTags(tag, true).map((t) => t.id) : [];
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
