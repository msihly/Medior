import autoBind from "auto-bind";
import { reaction } from "mobx";
import { getRootStore, Model, model, modelAction, modelFlow, prop } from "mobx-keystone";
import { asyncAction, CssColor } from "trabecula/utils/client";
import { IconName } from "medior/components";
import { RootStore } from "medior/store";
import { Tag } from "medior/store/tags/tag";
import { isDeepEqual } from "medior/utils/common";
import { trpc } from "medior/utils/server";

const reconcileRelationships = (current: Tag[], previousIds: string[], next: Tag[]) => {
  const selectedIds = new Set(current.map(({ id }) => id));
  const tags = new Map(next.map((tag) => [tag.id, tag]));

  for (const id of previousIds) {
    if (!selectedIds.has(id)) tags.delete(id);
  }

  for (const tag of current) {
    if (!previousIds.includes(tag.id)) tags.set(tag.id, tag);
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
  label: prop<string>("").withSetter(),
  parentTags: prop<Tag[]>(() => []).withSetter(),
  regExTestString: prop<string>("").withSetter(),
  regExValue: prop<string>("").withSetter(),
  tag: prop<Tag>(null).withSetter(),
}) {
  private labelLookupId = 0;
  private loadingTagId: string;
  private tagLoadRevision = 0;

  onInit() {
    autoBind(this);

    reaction(
      () => [this.label, this.tag?.id],
      async () => {
        const lookupId = ++this.labelLookupId;
        const stores = getRootStore<RootStore>(this);
        this.setIsDuplicate(false);

        if (!this.label?.length || this.label.toLowerCase() === this.tag?.label?.toLowerCase())
          return;

        const res = await stores.tag.getByLabel(this.label);
        if (lookupId !== this.labelLookupId) return;

        this.setIsDuplicate(!!res.data?.id && res.data.id !== this.tag?.id);
      },
    );

    reaction(
      () => this.isOpen,
      () => !this.isOpen && this.reset(),
    );
  }

  /* ---------------------------- STANDARD ACTIONS ---------------------------- */
  @modelAction
  reset() {
    this.labelLookupId++;
    this.tagLoadRevision++;
    this.aliases = [];
    this.categoryColor = null;
    this.categoryIcon = null;
    this.categoryInheritable = null;
    this.categorySortRank = null;
    this.childTags = [];
    this.isDuplicate = false;
    this.isLoading = false;
    this.label = "";
    this.parentTags = [];
    this.regExValue = "";
    this.regExTestString = "";
    this.tag = null;
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
        if (!previous || this.regExValue === previous.regEx) this.setRegExValue(tag.regEx);

        this.setTag(new Tag(tag));
      } finally {
        if (revision === this.tagLoadRevision) this.setIsLoading(false);
      }
    },
  );
}
