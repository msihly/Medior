import { computed } from "mobx";
import { applySnapshot, getSnapshot, model, Model, modelAction, prop } from "mobx-keystone";
import { TagStore } from ".";
import { RegExMapType } from "database";

export interface RegExMap {
  regEx: string;
  testString?: string;
  types: RegExMapType[];
}

@model("medior/Tag")
export class Tag extends Model({
  aliases: prop<string[]>(() => []),
  childIds: prop<string[]>(() => []),
  count: prop<number>(),
  dateCreated: prop<string>(),
  dateModified: prop<string>(),
  id: prop<string>(),
  label: prop<string>(),
  parentIds: prop<string[]>(() => []),
  regExMap: prop<RegExMap>(null),
}) {
  @modelAction
  update(tag: Partial<Tag>) {
    applySnapshot(this, { ...getSnapshot(this), ...tag });
  }

  @computed
  get tagOption() {
    return tagToOption(this);
  }
}

export type SearchTagType = "exclude" | "excludeDesc" | "includeAnd" | "includeDesc" | "includeOr";

export type TagOption = {
  aliases?: string[];
  count: number;
  dateCreated: string;
  dateModified: string;
  distance?: number;
  id: string;
  label: string;
  searchType?: SearchTagType;
};

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

export const tagToOption = (tag: Tag): TagOption => ({
  aliases: [...tag.aliases],
  count: tag.count,
  dateCreated: tag.dateCreated,
  dateModified: tag.dateModified,
  id: tag.id,
  label: tag.label,
  searchType: "includeDesc",
});