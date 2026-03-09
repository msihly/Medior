import { Comp, TagChip, TagToUpsert, View, ViewProps } from "medior/components";
import { TagOption } from "medior/store";

export const sortTags = <T extends TagToUpsert | TagOption>(tags: T[]) =>
  [...tags].sort((a, b) => {
    const aCat = a.category;
    const bCat = b.category;

    const cmp =
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
      (b.count ?? 0) - (a.count ?? 0);

    return cmp;
  });

export interface TagRowProps extends ViewProps {
  disabled?: boolean;
  tags: TagToUpsert[];
}

export const TagRow = Comp((props: TagRowProps) => {
  if (!props.tags?.length) return null;

  return (
    <View row spacing="0.5rem" overflow="auto hidden" {...props}>
      {sortTags(props.tags).map((tag) => (
        <TagChip key={tag.label} tag={tag} disabled={props.disabled} hasEditor />
      ))}
    </View>
  );
});
