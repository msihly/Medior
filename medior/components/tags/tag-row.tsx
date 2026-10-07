import { Comp, TagChip, TagToUpsert, View, ViewProps } from "medior/components";
import { TagOption, useStores } from "medior/store";
import { TAG_GAP } from "./tag-row-constants";
import { VirtualTagRow } from "./virtual-tag-row";

export const sortTags = <T extends TagToUpsert | TagOption>(
  tags: T[],
  getCategory: (tag: TagToUpsert | TagOption) => TagOption["category"] = (tag) => tag.category,
) =>
  tags
    .map((tag) => ({ category: getCategory(tag), tag }))
    .sort(
      ({ category: aCat, tag: a }, { category: bCat, tag: b }) =>
        // new tags first
        (a.id ? 1 : 0) - (b.id ? 1 : 0) ||
        // higher sortRank first
        (bCat?.sortRank ?? -Infinity) - (aCat?.sortRank ?? -Infinity) ||
        // category color present first
        (aCat?.color ? -1 : 0) - (bCat?.color ? -1 : 0) ||
        // color desc
        (aCat?.color && bCat?.color ? bCat.color.localeCompare(aCat.color) : 0) ||
        // icon present first
        (aCat?.icon ? -1 : 0) - (bCat?.icon ? -1 : 0) ||
        // icon desc
        (aCat?.icon && bCat?.icon ? bCat.icon.localeCompare(aCat.icon) : 0) ||
        // count desc
        (b.count ?? 0) - (a.count ?? 0),
    )
    .map(({ tag }) => tag);

export interface TagRowProps extends ViewProps {
  disabled?: boolean;
  limit?: number;
  tags: TagToUpsert[];
  virtualized?: boolean;
}

export const TagRow = Comp(
  ({ disabled, limit, tags, virtualized = false, ...props }: TagRowProps) => {
    const stores = useStores();

    if (!tags?.length) return null;

    const sortedTags = sortTags(tags, stores.tag.getCategory).slice(0, limit);

    if (virtualized)
      return (
        <View width="100%" height={56} {...props} overflow="hidden">
          <VirtualTagRow disabled={disabled} tags={sortedTags} />
        </View>
      );

    return (
      <View row spacing={TAG_GAP} overflow="auto hidden" {...props}>
        {sortedTags.map((tag) => (
          <TagChip key={tag.label} tag={tag} disabled={disabled} hasEditor />
        ))}
      </View>
    );
  },
);
