import { observer, Tag } from "medior/store";
import { TagChip, View } from "medior/components";

export type TagRowProps = {
  disabled?: boolean;
} & ({ tagIds: string[]; tags?: never } | { tagIds?: never; tags: Tag[] });

export const TagRow = observer((props: TagRowProps) => {
  return !props.tagIds?.length && !props.tags?.length ? null : (
    <View row spacing="0.5rem" overflow="auto hidden">
      {props.tagIds?.length > 0
        ? props.tagIds.map((tagId) => (
            <TagChip key={tagId} id={tagId} disabled={props.disabled} hasEditor />
          ))
        : props.tags?.map((tag) => (
            <TagChip key={tag.id} tag={tag} disabled={props.disabled} hasEditor />
          ))}
    </View>
  );
});
