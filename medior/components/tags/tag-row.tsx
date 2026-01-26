import { Comp, TagChip, TagToUpsert, View, ViewProps } from "medior/components";

export const sortTags = (tags: TagToUpsert[]) =>
  [...tags].sort((a, b) => {
    // Show new tags first
    if (a.id && !b.id) return 1;
    if (!a.id && b.id) return -1;
    // Show tags with higher category sortRank first
    if (a.category?.sortRank && b.category?.sortRank)
      return b.category.sortRank - a.category.sortRank;
    if (a.category?.sortRank) return -1;
    if (b.category?.sortRank) return 1;
    // Otherwise show highest counts first
    return b.count - a.count;
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
