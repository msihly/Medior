import { computed } from "mobx";
import {
  applySnapshot,
  arrayActions,
  getRootStore,
  model,
  Model,
  modelAction,
  ModelCreationData,
  prop,
} from "mobx-keystone";
import { File, RootStore } from "store";
import { Tag } from ".";

export type TagCount = {
  count: number;
  id: string;
};

export type TagOption = {
  aliases?: string[];
  count: number;
  id: string;
  label?: string;
  parentLabels?: string[];
};

@model("mediaViewer/TagStore")
export class TagStore extends Model({
  activeTagId: prop<string>(null).withSetter(),
  isTaggerOpen: prop<boolean>(false),
  isTagManagerOpen: prop<boolean>(false).withSetter(),
  tags: prop<Tag[]>(() => []),
  taggerMode: prop<"create" | "edit">("edit").withSetter(),
  tagManagerMode: prop<"create" | "edit" | "search">("search").withSetter(),
}) {
  @modelAction
  createTag(tag: ModelCreationData<Tag>) {
    this.tags.push(new Tag(tag));
  }

  @modelAction
  deleteTag(id: string) {
    this.tags = this.tags.filter((t) => t.id !== id);
  }

  @modelAction
  overwrite(tags: ModelCreationData<Tag>[]) {
    this.tags = tags.map((t) => new Tag(t));
  }

  @modelAction
  setIsTaggerOpen(isOpen: boolean) {
    if (isOpen) this.taggerMode = "edit";
    this.isTaggerOpen = isOpen;
  }

  getById(id: string) {
    return this.tags.find((t) => t.id === id);
  }

  getByLabel(label: string) {
    return this.tags.find((t) => t.label === label);
  }

  getTagCounts(files: File[], includeParents = false) {
    const tagIds = [
      ...new Set(
        files.map((f) => f.tags.map((t) => [t.id, ...(includeParents ? t.parentIds : [])])).flat(2)
      ),
    ];

    return tagIds.map((id) => ({
      id,
      count: this.tagCounts.find((t) => t.id === id)?.count ?? 0,
    }));
  }

  getTagCountById(id: string) {
    return this.tagCounts.find((t) => t.id === id)?.count ?? 0;
  }

  listByParentId(id: string) {
    return this.tags.filter((t) => t.parentIds.includes(id));
  }

  @computed
  get activeTag() {
    return this.tags.find((t) => t.id === this.activeTagId);
  }

  @computed
  get tagCounts() {
    const { fileStore } = getRootStore<RootStore>(this);

    return fileStore.files
      .map((f) => f.tagAncestry)
      .flat(2)
      .reduce((tagCounts, id) => {
        if (!id) return tagCounts;

        const tagCount = tagCounts.find((t) => t.id === id);
        if (!tagCount) tagCounts.push({ count: 1, id });
        else tagCount.count++;

        return tagCounts;
      }, [] as TagCount[])
      .sort((a, b) => a.count - b.count);
  }

  @computed
  get tagOptions() {
    return this.tags
      .map((t) => ({
        aliases: [...t.aliases],
        count: t.count,
        id: t.id,
        label: t.label,
        parentLabels: t.parentTags?.map((t) => t.label),
      }))
      .sort((a, b) => b.count - a.count);
  }
}
