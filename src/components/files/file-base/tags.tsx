import { Tag as MobxTag } from "store";
import { Tag, View } from "components";
import { colors, makeClasses } from "utils";

interface TagsProps {
  disabled?: boolean;
  onTagPress?: (id: string) => void;
  tags: MobxTag[];
}

export const Tags = ({ disabled, onTagPress, tags }: TagsProps) => {
  const { css } = useClasses(null);

  return (
    <View row className={css.tags}>
      {tags.slice(0, 5).map((tag) => (
        <Tag
          key={tag.id}
          tag={tag}
          onClick={!disabled ? () => onTagPress(tag.id) : undefined}
          size="small"
        />
      ))}
    </View>
  );
};

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
