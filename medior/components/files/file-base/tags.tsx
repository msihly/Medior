import { TagSchema } from "medior/_generated/server";
import { Comp, TagRow, View } from "medior/components";
import { makeClasses } from "medior/utils/client";

interface TagsProps {
  tags: TagSchema[];
}

export const Tags = Comp(({ tags }: TagsProps) => {
  const { css } = useClasses(null);

  return !tags?.length ? (
    <View />
  ) : (
    <TagRow tags={tags} limit={3} spacing="0.2rem" overflow="hidden" className={css.tags} />
  );
});

const useClasses = makeClasses({
  tags: {
    position: "relative",
    borderRadius: "inherit",
    padding: "1rem 0 0.3rem 0.3rem",
    width: "100%",
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
