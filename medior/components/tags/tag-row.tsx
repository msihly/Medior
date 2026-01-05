import { TagSchema } from "medior/_generated/server";
import { Comp, TagChip, View, ViewProps } from "medior/components";

export const sortTags = (tags: TagSchema[]) =>
  [...tags].sort((a, b) => {
    if (a.category?.sortRank && b.category?.sortRank)
      return b.category.sortRank - a.category.sortRank;
    else if (a.category?.sortRank) return -1;
    else if (b.category?.sortRank) return 1;
    else return b.count - a.count;
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
        <TagChip key={tag.id} tag={tag} disabled={props.disabled} hasEditor />
      ))}
    </View>
  );
});
