import autoBind from "auto-bind";
import { ListTagRegExOverlapsOutput } from "medior/_generated/server";
import { computed, reaction } from "mobx";
import { Model, model, modelAction, modelFlow, prop } from "mobx-keystone";
import { IconName } from "medior/components";
import { RootStore } from "medior/store";
import { Tag } from "medior/store/tags/tag";
import { asyncAction, CssColor, toast } from "medior/utils/client";
import {
  isDeepEqual,
  makeTagRegEx,
  normalizeTagRegExKey,
  parseTagRegEx,
  TagRegExTermMode,
} from "medior/utils/common";
import { trpc } from "medior/utils/server";

export type TagRegExTermSetting = TagRegExTermMode | "off";

const reconcileRelationships = (current: Tag[], previousIds: string[], next: Tag[]) => {
  const previous = new Set(previousIds);
  const selectedIds = new Set(current.map(({ id }) => id));
  const tags = new Map(next.map((tag) => [tag.id, tag]));

  for (const id of previousIds) {
    if (!selectedIds.has(id)) tags.delete(id);
  }

  for (const tag of current) {
    if (!previous.has(tag.id)) tags.set(tag.id, tag);
  }

  return [...tags.values()];
};

@model("medior/TagEditorStore")
export class TagEditorStore extends Model({
  aliases: prop<string[]>(() => []).withSetter(),
  categoryColor: prop<CssColor>(null).withSetter(),
  categoryIcon: prop<IconName>(null).withSetter(),
  categoryInheritable: prop<boolean>(false).withSetter(),
  categorySortRank: prop<number>(null).withSetter(),
  childTags: prop<Tag[]>(() => []).withSetter(),
  isDuplicate: prop<boolean>(false).withSetter(),
  isLoading: prop<boolean>(false).withSetter(),
  isOpen: prop<boolean>(false).withSetter(),
  label: prop<string>(""),
  parentTags: prop<Tag[]>(() => []).withSetter(),
  regExCustom: prop<string>("").withSetter(),
  regExOverlaps: prop<Awaited<ListTagRegExOverlapsOutput>["data"]>(null).withSetter(),
  regExTermModes: prop<Record<string, TagRegExTermSetting>>(() => ({})),
  regExTestString: prop<string>("").withSetter(),
  tag: prop<Tag>(null).withSetter(),
}) {
  private loadingTagId: string;
  private tagLoadRevision = 0;

  onAttachedToRootStore(stores: RootStore) {
    let controller: AbortController;
    let timer: ReturnType<typeof setTimeout>;

    const disposeLabel = reaction(
      () => [this.isOpen, this.label, this.tag?.id],
      () => {
        clearTimeout(timer);
        controller?.abort();
        this.setIsDuplicate(false);

        if (
          this.isOpen &&
          this.label?.length &&
          this.label.toLowerCase() !== this.tag?.label?.toLowerCase()
        ) {
          const label = this.label;
          const request = new AbortController();

          controller = request;
          timer = setTimeout(async () => {
            const res = await stores.tag.getByLabel({ label, signal: request.signal });

            if (!request.signal.aborted)
              this.setIsDuplicate(!!res.data?.id && res.data.id !== this.tag?.id);
          }, 200);
        }
      },
    );

    const disposeOpen = reaction(
      () => this.isOpen,
      () => !this.isOpen && this.reset(),
    );

    let overlapController: AbortController;
    let overlapTimer: ReturnType<typeof setTimeout>;

    const disposeOverlaps = reaction(
      () => [this.isOpen, this.regExValue, this.regExTerms.map(({ term }) => term).join("\n")],
      () => {
        clearTimeout(overlapTimer);
        overlapController?.abort();
        this.setRegExOverlaps(null);

        if (this.isOpen && this.label.trim() && this.isRegExValid) {
          const request = new AbortController();

          overlapController = request;
          overlapTimer = setTimeout(async () => {
            const res = await this.loadRegExOverlaps(request.signal);
            if (!res.success) toast.error(res.error);
          }, 300);
        }
      },
    );

    return () => {
      clearTimeout(timer);
      clearTimeout(overlapTimer);
      controller?.abort();
      overlapController?.abort();
      disposeLabel();
      disposeOpen();
      disposeOverlaps();
    };
  }

  onInit() {
    autoBind(this);
  }

  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  clearRegEx() {
    this.regExCustom = "";
    this.regExTermModes = {};
    this.regExTestString = "";
  }

  /** Reads term groups for the current label and aliases; any other pattern stays custom. */
  @modelAction
  loadRegEx(regEx: string) {
    const { custom, groups } = parseTagRegEx(regEx);
    const customParts: string[] = [];
    const keys = new Set(this.regExTerms.map(({ key }) => key));
    const modes: Record<string, TagRegExTermSetting> = {};

    for (const group of groups) {
      const key = normalizeTagRegExKey(group.term.term);

      if (keys.has(key) && !modes[key]) modes[key] = group.term.mode;
      else customParts.push(group.source);
    }

    this.regExCustom = [...customParts, custom].filter(Boolean).join("|");
    this.regExTermModes = modes;
  }

  @modelAction
  reset() {
    this.tagLoadRevision++;
    this.aliases = [];
    this.categoryColor = null;
    this.categoryIcon = null;
    this.categoryInheritable = false;
    this.categorySortRank = null;
    this.childTags = [];
    this.isDuplicate = false;
    this.isLoading = false;
    this.label = "";
    this.parentTags = [];
    this.regExCustom = "";
    this.regExOverlaps = null;
    this.regExTermModes = {};
    this.regExTestString = "";
    this.tag = null;
  }

  @modelAction
  setAllRegExTermModes(mode: TagRegExTermSetting) {
    this.regExTermModes = Object.fromEntries(this.regExTerms.map(({ key }) => [key, mode]));
  }

  /** A renamed label moves its match mode to its new term. Alias terms keep their own modes. */
  @modelAction
  setLabel(label: string) {
    const aliasKeys = new Set(
      this.aliases
        .map((alias) => alias?.trim())
        .filter(Boolean)
        .map(normalizeTagRegExKey),
    );
    const prevKey = this.label.trim() && normalizeTagRegExKey(this.label.trim());
    const nextKey = label.trim() && normalizeTagRegExKey(label.trim());
    const mode = this.regExTermModes[prevKey];

    if (mode && prevKey !== nextKey && !aliasKeys.has(prevKey)) {
      delete this.regExTermModes[prevKey];

      if (nextKey && !aliasKeys.has(nextKey)) this.regExTermModes[nextKey] = mode;
    }

    this.label = label;
  }

  @modelAction
  setRegExTermMode(key: string, mode: TagRegExTermSetting) {
    this.regExTermModes[key] = mode;
  }

  /* ------------------------------ ASYNC ACTIONS ----------------------------- */
  @modelFlow
  loadTag = asyncAction(
    async ({ id, preserveChanges = false }: { id: string; preserveChanges?: boolean }) => {
      if (preserveChanges && this.isLoading && this.loadingTagId !== id) return;

      const revision = ++this.tagLoadRevision;

      this.loadingTagId = id;

      if (!preserveChanges) this.setIsLoading(true);

      try {
        const res = await trpc.getTagWithRelations.mutate({ id });

        if (!res.success) throw new Error(res.error);

        if (revision !== this.tagLoadRevision) return;

        const tag = res.data.tag;
        const previous = preserveChanges ? this.tag : null;
        const hasRegExChanges = previous && this.regExValue !== (previous.regEx ?? "");

        this.setChildTags(
          previous
            ? reconcileRelationships(
                this.childTags,
                previous.childIds,
                res.data.childTags.map((child) => new Tag(child)),
              )
            : res.data.childTags.map((child) => new Tag(child)),
        );

        this.setParentTags(
          previous
            ? reconcileRelationships(
                this.parentTags,
                previous.parentIds,
                res.data.parentTags.map((parent) => new Tag(parent)),
              )
            : res.data.parentTags.map((parent) => new Tag(parent)),
        );

        if (!previous || this.categoryColor === previous.category?.color)
          this.setCategoryColor(tag.category?.color);

        if (!previous || this.categoryIcon === previous.category?.icon)
          this.setCategoryIcon(tag.category?.icon);

        if (!previous || this.categoryInheritable === previous.category?.inheritable)
          this.setCategoryInheritable(tag.category?.inheritable);

        if (!previous || this.categorySortRank === previous.category?.sortRank)
          this.setCategorySortRank(tag.category?.sortRank);

        if (!previous || isDeepEqual(this.aliases, previous.aliases)) this.setAliases(tag.aliases);

        if (!previous || this.label === previous.label) this.setLabel(tag.label);

        if (!previous) this.setRegExTestString("");

        if (!hasRegExChanges) this.loadRegEx(tag.regEx);

        this.setTag(new Tag(tag));
      } finally {
        if (revision === this.tagLoadRevision) this.setIsLoading(false);
      }
    },
  );

  @modelFlow
  loadRegExOverlaps = asyncAction(async (signal: AbortSignal) => {
    try {
      const res = await trpc.listTagRegExOverlaps.mutate(
        {
          regEx: this.regExValue,
          tagId: this.tag?.id,
          terms: this.regExTerms.map(({ term }) => term),
        },
        { signal },
      );

      if (!res.success) throw new Error(res.error);

      this.setRegExOverlaps(res.data);
    } catch (error) {
      if (!signal.aborted) throw error;
    }
  });

  /* --------------------------------- GETTERS -------------------------------- */
  @computed
  get isRegExValid() {
    try {
      new RegExp(this.regExValue, "im");

      return true;
    } catch {
      return false;
    }
  }

  /** The label and aliases, each with its match mode. */
  @computed
  get regExTerms() {
    const terms = new Map<string, { mode: TagRegExTermSetting; term: string }>();

    for (const term of [this.label, ...this.aliases].map((term) => term?.trim())) {
      const key = term && normalizeTagRegExKey(term);

      if (key && !terms.has(key)) terms.set(key, { mode: this.regExTermModes[key] ?? "off", term });
    }

    return [...terms].map(([key, term]) => ({ ...term, key }));
  }

  @computed
  get regExValue() {
    return makeTagRegEx(
      this.regExTerms.flatMap(({ mode, term }) => (mode === "off" ? [] : [{ mode, term }])),
      this.regExCustom,
    );
  }
}
