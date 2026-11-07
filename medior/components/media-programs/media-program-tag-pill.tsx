import { Comp, IconName, MediaProgramPill, TagToUpsert } from "medior/components";
import { useStores } from "medior/store";
import { getChipColors } from "medior/utils/client";

export interface MediaProgramTagPillProps {
  tag: TagToUpsert;
}

/** A tag in its category's color and icon, which opens the Tag Editor. */
export const MediaProgramTagPill = Comp(({ tag }: MediaProgramTagPillProps) => {
  const stores = useStores();
  const store = stores.tag;

  const category = store.getCategory(tag);
  const chipColors = category?.color ? getChipColors(category.color, 0.3) : null;

  const handleClick = () => {
    store.editor.setIsOpen(true);
    store.editor.loadTag({ id: tag.id });
  };

  return (
    <MediaProgramPill
      label={tag.label}
      icon={category?.icon as IconName}
      bgColor={chipColors?.background}
      color={chipColors?.color}
      onClick={handleClick}
    />
  );
});
