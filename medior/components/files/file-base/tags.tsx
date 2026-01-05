import { TagSchema } from "medior/_generated/server";
import { Comp, sortTags, TagChip, View } from "medior/components";
import { makeClasses } from "medior/utils/client";

interface TagsProps {
  tags: TagSchema[];
}

export const Tags = Comp(({ tags }: TagsProps) => {
  const { css } = useClasses(null);

  return (
    <View row spacing="0.2rem" className={css.tags}>
      {sortTags(tags)
        .slice(0, 3)
        .map((tag, i) => (
          <TagChip key={i} tag={tag} size="small" />
        ))}
    </View>
  );
});

const useClasses = makeClasses({
  tags: {
    position: "relative",
    borderRadius: "inherit",
    padding: "1rem 0 0.3rem 0.3rem",
    width: "100%",
    overflow: "hidden",
    "&::after": {
      content: '""',
      position: "absolute",
      top: 0,
      bottom: 0,
      right: 0,
      left: 0,
      background: "linear-gradient(155deg, transparent 75%, black)",
    },
  },
});
