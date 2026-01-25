import { TagSchema } from "medior/_generated/server";
import { Comp, TagChip, View, ViewProps } from "medior/components";

export const sortTags = (tags: TagSchema[]) =>
  [...tags].sort((a, b) => {
    // Show tags with higher category sortRank first
    if (a.category?.sortRank && b.category?.sortRank)
      return b.category.sortRank - a.category.sortRank;
    if (a.category?.sortRank) return -1;
    if (b.category?.sortRank) return 1;
    // Show new tags first
    if (a.id && !b.id) return 1;
    if (!a.id && b.id) return -1;
    // Otherwise show highest counts first
    return b.count - a.count;
  });

export interface TagRowProps extends ViewProps {
  disabled?: boolean;
  tags: TagSchema[];
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
