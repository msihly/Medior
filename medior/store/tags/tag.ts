import { TagSchema } from "medior/_generated";
import { computed } from "mobx";
import { ExtendedModel, model } from "mobx-keystone";
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
  descendantIds?: string[];
  id: string;
  label: string;
  searchType?: SearchTagType;
};

export const tagToOption = (tag: TagSchema): TagOption => ({
  aliases: [...tag.aliases],
  count: tag.count,
  descendantIds: [...tag.descendantIds],
  id: tag.id,
  label: tag.label,
  searchType: "includeDesc",
});
