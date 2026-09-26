import { TagSchema } from "medior/_generated/server";
import { Comp, TagRow, View } from "medior/components";
import { makeClasses } from "medior/utils/client";

interface TagsProps {
  compact?: boolean;
  tags: TagSchema[];
}

export const Tags = Comp(({ compact = false, tags }: TagsProps) => {
  const { css } = useClasses({ compact });

  return !tags?.length ? (
    <View />
  ) : (
    <TagRow tags={tags} limit={3} spacing="0.2rem" overflow="hidden" className={css.tags} />
  );
});

const useClasses = makeClasses(({ compact }: Pick<TagsProps, "compact">) => ({
  tags: {
    "&::after": {
      background: "linear-gradient(155deg, transparent 75%, black)",
      bottom: 0,
      content: '""',
      left: 0,
      position: "absolute",
      right: 0,
      top: 0,
    },
    borderRadius: "inherit",
    padding: `${compact ? "0.2rem" : "1rem"} 0 0.3rem 0.3rem`,
    position: "relative",
    width: "100%",
  },
}));
