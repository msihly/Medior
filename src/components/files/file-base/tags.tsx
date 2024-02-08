import { Tag, View } from "components";
import { observer } from "mobx-react-lite";
import { useStores } from "store";
import { colors, makeClasses } from "utils";

interface TagsProps {
  tagIds: string[];
}

export const Tags = observer(({ tagIds }: TagsProps) => {
  const { css } = useClasses(null);

  const { tagStore } = useStores();

  const tags = tagStore.listByIds(tagIds.slice(0, 3));

  return (
    <View row className={css.tags}>
      {tags.map((tag, i) => (
        <Tag key={i} tag={tag} size="small" />
      ))}
    </View>
  );
});

const useClasses = makeClasses({
  tags: {
    position: "relative",
    overflow: "hidden",
    width: "100%",
    "&::after": {
      content: '""',
      position: "absolute",
      top: 0,
      bottom: 0,
      right: 0,
      left: 0,
      background: `linear-gradient(to right, transparent 60%, ${colors.grey["900"]})`,
    },
  },
});
