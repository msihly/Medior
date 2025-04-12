import { Icon, Text, View } from "medior/components";
import { observer, useStores } from "medior/store";
import { colors, makeClasses } from "medior/utils/client";
import { TagToUpsert } from ".";

export interface TagHierarchyProps {
  className?: string;
  tag: TagToUpsert;
}

export const TagHierarchy = ({ className, tag }: TagHierarchyProps) => {
  const { css, cx } = useClasses({ hasId: !!tag.id });

  return (
    <View column className={cx(css.container, className)}>
      <TagLevel tag={tag} />
    </View>
  );
};

const TagLevel = observer(({ tag }: TagHierarchyProps) => {
  const { css } = useClasses({ hasId: !!tag.id });

  const stores = useStores();

  const handleClick = () => {
    stores.tag.setActiveTagId(tag?.id);
    stores.tag.setIsTagEditorOpen(true);
  };

  return (
    <View column>
      <View onClick={tag.id ? handleClick : null} row align="center" className={css.tagLevel}>
        <Icon
          name={tag.id ? "Edit" : "AddCircle"}
          color={tag.id ? colors.custom.blue : colors.custom.green}
          margins={{ right: "0.5rem" }}
        />

        <Text>{tag.label}</Text>
      </View>

      {tag.children?.length > 0 && (
        <View margins={{ left: "1rem" }}>
          {tag.children.map((t) => (
            <TagLevel key={t.label} tag={t} />
          ))}
        </View>
      )}
    </View>
  );
});

interface ClassesProps {
  hasId: boolean;
}

const useClasses = makeClasses((props: ClassesProps) => ({
  container: {
    flexShrink: 0,
    borderRadius: 4,
    marginRight: "0.5rem",
    padding: "0.5rem 1rem 0.5rem 0.5rem",
    backgroundColor: colors.background,
    overflowY: "auto",
  },
  tagLevel: {
    cursor: props.hasId ? "pointer" : "default",
  },
}));
