import { useState } from "react";
import { Comp, TagChip, TagToUpsert, View } from "medior/components";
import { Ingester, Reingester, useStores } from "medior/store";
import { colors, makeClasses, toast } from "medior/utils/client";

export interface TagHierarchyProps {
  className?: string;
  isChild?: boolean;
  store: Ingester | Reingester;
  tag: TagToUpsert;
}

export const TagHierarchy = Comp(({ className, store, tag }: TagHierarchyProps) => {
  const { css, cx } = useClasses(null);

  return (
    <View column className={cx(css.container, className)}>
      <TagLevel store={store} tag={tag} />
    </View>
  );
});

const TagLevel = Comp(({ isChild, store, tag }: TagHierarchyProps) => {
  const stores = useStores();
  const [isCreating, setIsCreating] = useState(false);
  const { css } = useClasses(null);

  const handleCreate = async () => {
    if (isCreating) return;
    setIsCreating(true);

    try {
      const res = await stores.tag.upsertTags([tag]);
      if (!res.success) throw new Error(res.error);

      const createdTag = res.data[0];
      if (!createdTag) throw new Error("Failed to create tag");
      store.setCreatedTagId(createdTag);
      stores.tag.editor.setIsOpen(true);
      stores.tag.editor.loadTag(createdTag.id);
    } catch (error) {
      toast.error(error);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <View
      column
      spacing="0.3rem"
      className={isChild ? css.tagLevel : undefined}
      data-child={isChild || undefined}
    >
      <TagChip
        disabled={isCreating}
        onClick={tag.id ? undefined : handleCreate}
        tag={tag}
        hasEditor
        width="fit-content"
      />

      {tag.children?.length > 0 && (
        <View column spacing="0.3rem" margins={{ left: "1rem" }} className={css.children}>
          {tag.children.map((t) => (
            <TagLevel key={t.label} store={store} tag={t} isChild />
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
