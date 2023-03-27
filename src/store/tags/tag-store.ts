import { computed } from "mobx";
import { model, Model, modelAction, ModelCreationData, prop } from "mobx-keystone";
import { Tag } from ".";

export type TagOption = {
  aliases?: string[];
  count: number;
  id: string;
  label?: string;
};

@model("mediaViewer/TagStore")
export class TagStore extends Model({
  activeTagId: prop<string>(null).withSetter(),
  isTagManagerOpen: prop<boolean>(false).withSetter(),
  tags: prop<Tag[]>(() => []),
  tagManagerMode: prop<"create" | "edit" | "search">("search").withSetter(),
}) {
  @modelAction
  createTag(tag: ModelCreationData<Tag>) {
    this.tags.push(new Tag(tag));
  }

  @modelAction
  deleteTag(id: string) {
    this.tags.forEach((t) => {
      if (t.parentIds.includes(id)) t.parentIds.splice(t.parentIds.indexOf(id));
    });

    this.tags.splice(this.tags.findIndex((t) => t.id === id));
  }

  @modelAction
  editRelatedTags({
    childIds,
    parentIds,
    remove = false,
    tagId,
  }: {
    childIds?: string[];
    parentIds?: string[];
    remove?: boolean;
    tagId: string;
  }) {
    if (!childIds?.length && !parentIds?.length)
      return console.debug("No childIds or parentIds passed to editRelatedTags");

    this.tags.forEach((t) => {
      if (childIds.includes(t.id)) {
        if (remove) {
          const parentIndex = t.parentIds.indexOf(tagId);
          if (parentIndex > -1) t.parentIds.splice(parentIndex);
        } else t.parentIds.push(tagId);
      } else if (parentIds.includes(t.id)) {
        if (remove) {
          const childIndex = t.childIds.indexOf(tagId);
          if (childIndex > -1) t.childIds.splice(childIndex);
        } else t.childIds.push(tagId);
      }
    });
  }

  @modelAction
  overwrite(tags: ModelCreationData<Tag>[]) {
    this.tags = tags.map((t) => new Tag(t));
  }

  getById(id: string) {
    return this.tags.find((t) => t.id === id);
  }

  getByLabel(label: string) {
    return this.tags.find((t) => t.label.toLowerCase() === label.toLowerCase());
  }

  getChildTags(tag: Tag) {
    return this.listByIds(tag.childIds);
  }

  getParentTags(tag: Tag) {
    return this.listByIds(tag.parentIds);
  }

  listByIds(ids: string[]) {
    return this.tags.filter((t) => ids.includes(t.id));
  }

  listByParentId(id: string) {
    return this.tags.filter((t) => t.parentIds.includes(id));
  }

  @computed
  get activeTag() {
    return this.tags.find((t) => t.id === this.activeTagId);
  }

  @computed
  get tagOptions() {
    return this.tags.map((t) => t.tagOption).sort((a, b) => b.count - a.count);
  }
}
