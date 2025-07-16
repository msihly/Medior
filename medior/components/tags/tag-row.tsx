import { TagSchema } from "medior/_generated";
import { Comp, TagChip, View } from "medior/components";

export type TagRowProps = {
  disabled?: boolean;
  tags: TagSchema[];
};

export const TagRow = Comp((props: TagRowProps) => {
  if (!props.tags?.length) return null;

  return (
    <View row spacing="0.5rem" overflow="auto hidden">
      {props.tags.map((tag) => (
        <TagChip key={tag.id} tag={tag} disabled={props.disabled} hasEditor />
      ))}
    </View>
  );
});
