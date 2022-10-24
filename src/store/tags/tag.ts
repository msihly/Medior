import { computed } from "mobx";
import {
  applySnapshot,
  getRootStore,
  getSnapshot,
  model,
  Model,
  modelAction,
  prop,
} from "mobx-keystone";
import { RootStore } from "store";

export const getTagAncestry = (tags: Tag[]): string[] =>
  tags.flatMap((t) => [t.id, ...getTagAncestry(t.parentTags)]);

@model("mediaViewer/Tag")
export class Tag extends Model({
  aliases: prop<string[]>(() => []),
  id: prop<string>(),
  label: prop<string>(),
  parentIds: prop<string[]>(() => []),
}) {
  @modelAction
  update(tag: Partial<Tag>) {
    applySnapshot(this, { ...getSnapshot(this), ...tag });
  }

  @computed
  get count() {
    const { tagStore } = getRootStore<RootStore>(this);
    return tagStore.getTagCountById(this.id);
  }

  @computed
  get parentTags() {
    const { tagStore } = getRootStore<RootStore>(this);
    return this.parentIds.map((id) => tagStore.getById(id));
  }

  @computed
  get tagAncestry() {
    return getTagAncestry(this.parentTags);
  }

  @computed
  get tagOption() {
    return {
      aliases: [...this.aliases],
      count: this.count,
      id: this.id,
      label: this.label,
      parentLabels: this.parentTags.map((t) => t.label),
    };
  }

  @computed
  get parentTagOptions() {
    return this.parentTags.map((t) => t.tagOption);
  }
}
