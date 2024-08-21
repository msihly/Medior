import { computed } from "mobx";
import { ExtendedModel, model } from "mobx-keystone";
import { RootStore } from "medior/store";
import { _Tag } from "medior/store/_generated";

@model("medior/Tag")
export class Tag extends ExtendedModel(_Tag, {}) {
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
