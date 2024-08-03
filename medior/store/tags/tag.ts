import { RegExMapType } from "medior/database";
import { computed } from "mobx";
import { applySnapshot, getSnapshot, model, Model, modelAction, prop } from "mobx-keystone";
import { RootStore } from "medior/store";

export interface RegExMap {
  regEx: string;
  testString?: string;
  types: RegExMapType[];
}

@model("medior/Tag")
export class Tag extends Model({
  aliases: prop<string[]>(() => []),
  ancestorIds: prop<string[]>(() => []),
  childIds: prop<string[]>(() => []),
  count: prop<number>(),
  dateCreated: prop<string>(),
  dateModified: prop<string>(),
  descendantIds: prop<string[]>(() => []),
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
  distance?: number;
  id: string;
  label: string;
  searchType?: SearchTagType;
};

export const getTagDescendants = (stores: RootStore, tag: Tag, depth = -1): string[] =>
  tag.childIds.length === 0 || depth === 0
    ? []
    : [
        ...tag.childIds,
        ...stores.tag
          .getChildTags(tag)
          .flatMap((t) => getTagDescendants(stores, t, depth === -1 ? -1 : depth - 1)),
      ];

export const tagsToDescendants = (stores: RootStore, tags: Tag[], depth = -1): string[] => [
  ...new Set(tags.flatMap((t) => getTagDescendants(stores, t, depth))),
];

export const tagToOption = (tag: Tag): TagOption => ({
  aliases: [...tag.aliases],
  count: tag.count,
  id: tag.id,
  label: tag.label,
  searchType: "includeDesc",
});
