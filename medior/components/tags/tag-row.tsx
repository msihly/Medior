import { TagSchema } from "medior/_generated";
import { Comp, TagChip, View, ViewProps } from "medior/components";

export interface TagRowProps extends ViewProps {
  disabled?: boolean;
  tags: TagSchema[];
}

export const TagRow = Comp((props: TagRowProps) => {
  if (!props.tags?.length) return null;

  return (
    <View row spacing="0.5rem" overflow="auto hidden" {...props}>
      {[...props.tags]
        .sort((a, b) => b.count - a.count)
        .map((tag) => (
          <TagChip key={tag.id} tag={tag} disabled={props.disabled} hasEditor />
        ))}
    </View>
  );
});
