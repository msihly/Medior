import { Comp, TagChip, TagToUpsert, View } from "medior/components";
import { colors, makeClasses } from "medior/utils/client";

export interface TagHierarchyProps {
  className?: string;
  isChild?: boolean;
  tag: TagToUpsert;
}

export const TagHierarchy = Comp(({ className, tag }: TagHierarchyProps) => {
  const { css, cx } = useClasses(null);

  return (
    <View column className={cx(css.container, className)}>
      <TagLevel tag={tag} />
    </View>
  );
});

const TagLevel = Comp(({ isChild, tag }: TagHierarchyProps) => {
  const { css } = useClasses(null);

  return (
    <View
      column
      spacing="0.3rem"
      className={isChild ? css.tagLevel : undefined}
      data-child={isChild || undefined}
    >
      <TagChip tag={tag} hasEditor />

      {tag.children?.length > 0 && (
        <View column spacing="0.3rem" margins={{ left: "1rem" }} className={css.children}>
          {tag.children.map((t) => (
            <TagLevel key={t.label} tag={t} isChild />
          ))}
        </View>
      )}
    </View>
  );
});

const ELBOW_HEIGHT = 14;
const LINE_WIDTH = 2;
const LINE_COLOR = colors.custom.lightGrey;

const useClasses = makeClasses({
  container: {
    flexShrink: 0,
    borderRadius: 8,
    marginRight: "0.5rem",
    padding: "0.6rem 0.7rem 0.5rem 0.7rem",
    backgroundColor: colors.background,
    overflowY: "auto",
  },
  children: {
    position: "relative",
    "&::before": {
      content: '""',
      position: "absolute",
      left: "-0.5rem",
      top: 0,
      bottom: 0,
      width: LINE_WIDTH,
      backgroundColor: LINE_COLOR,
    },
    "& > :last-child": {
      position: "relative",
      "&::before": {
        content: '""',
        position: "absolute",
        left: "-0.5rem",
        top: ELBOW_HEIGHT - LINE_WIDTH,
        bottom: 0,
        width: LINE_WIDTH,
        backgroundColor: colors.background,
        pointerEvents: "none",
      },
    },
  },
  tagLevel: {
    position: "relative",
    "&::after": {
      content: '""',
      position: "absolute",
      left: "-0.5rem",
      top: ELBOW_HEIGHT - 7,
      width: "0.5rem",
      height: "0.5rem",
      borderLeft: `${LINE_WIDTH}px solid ${LINE_COLOR}`,
      borderBottom: `${LINE_WIDTH}px solid ${LINE_COLOR}`,
      borderBottomLeftRadius: "0.5rem",
      pointerEvents: "none",
    },
  },
});
