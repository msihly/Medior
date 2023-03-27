import { computed } from "mobx";
import { applySnapshot, getSnapshot, model, Model, modelAction, prop } from "mobx-keystone";
import { TagStore } from "store";

export const getTagDescendants = (tagStore: TagStore, tag: Tag, depth = -1): string[] =>
  tag.childIds.length === 0 || depth === 0
    ? []
    : [
        ...tag.childIds,
        ...tagStore
          .getChildTags(tag)
          .flatMap((t) => getTagDescendants(tagStore, t, depth === -1 ? -1 : depth - 1)),
      ];

export const tagsToDescendants = (tagStore: TagStore, tags: Tag[], depth = -1): string[] => [
  ...new Set(tags.flatMap((t) => getTagDescendants(tagStore, t, depth))),
];

@model("mediaViewer/Tag")
export class Tag extends Model({
  aliases: prop<string[]>(() => []),
  childIds: prop<string[]>(() => []),
  count: prop<number>(),
  hidden: prop<boolean>(),
  id: prop<string>(),
  label: prop<string>(),
  parentIds: prop<string[]>(() => []),
}) {
  @modelAction
  update(tag: Partial<Tag>) {
    applySnapshot(this, { ...getSnapshot(this), ...tag });
  }

  @computed
  get tagOption() {
    return {
      aliases: [...this.aliases],
      count: this.count,
      id: this.id,
      label: this.label,
    };
  }
}
