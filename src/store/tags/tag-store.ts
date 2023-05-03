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
