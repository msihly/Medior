import { useLayoutEffect, useRef, useState } from "react";
import { Comp, IconButton, sortTags, TagChip, TagToUpsert, View } from "medior/components";
import { Ingester, Reingester, useStores } from "medior/store";
import { toast } from "medior/utils/client";
import { mergeTagDefinitions } from "medior/utils/common";

export const IMPORT_TAG_ROW_HEIGHT = 40;

export interface TagHierarchyProps {
  depth: number;
  expanded: boolean;
  hasChildren: boolean;
  hasEditor?: boolean;
  onTagClick?: (tag: TagToUpsert) => void;
  onToggle: () => void;
  onWidth: (width: number) => void;
  store?: Ingester | Reingester;
  tag: TagToUpsert;
}

export const TagHierarchy = Comp(
  ({
    depth,
    expanded,
    hasChildren,
    hasEditor = true,
    onTagClick,
    onToggle,
    onWidth,
    store,
    tag,
  }: TagHierarchyProps) => {
    const stores = useStores();

    const [isCreating, setIsCreating] = useState(false);

    const rowRef = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
      const row = rowRef.current;

      if (!row) return;

      const measure = () => onWidth(row.offsetWidth);

      const observer = new ResizeObserver(measure);

      observer.observe(row);
      measure();

      return () => observer.disconnect();
    }, [onWidth]);

    const handleCreate = async () => {
      if (isCreating || !store) return;

      setIsCreating(true);

      try {
        const res = await stores.tag.upsertTags({ tagsToUpsert: [tag] });

        if (!res.success) throw new Error(res.error);

        const createdTag = res.data[0];

        if (!createdTag) throw new Error("Failed to create tag");

        store.setCreatedTagId(createdTag);
        stores.tag.editor.setIsOpen(true);
        stores.tag.editor.loadTag({ id: createdTag.id });
      } catch (error) {
        toast.error(error);
      } finally {
        setIsCreating(false);
      }
    };

    const handleClick = () => {
      if (tag.id) onTagClick?.(tag);
      else if (store) handleCreate();
    };

    return (
      <View
        ref={rowRef}
        row
        align="center"
        width="max-content"
        height={IMPORT_TAG_ROW_HEIGHT}
        padding={{ left: depth * 12 }}
      >
        {hasChildren && (
          <View width={24} flex="none">
            <IconButton
              name="ChevronRight"
              tooltip={expanded ? "Collapse tags" : "Expand tags"}
              onClick={onToggle}
              iconProps={{ rotation: expanded ? 90 : 0, size: 24 }}
              padding={{ all: 0 }}
            />
          </View>
        )}

        <TagChip
          disabled={isCreating}
          onClick={onTagClick || (!tag.id && store) ? handleClick : undefined}
          tag={tag}
          hasEditor={hasEditor}
          width="fit-content"
        />
      </View>
    );
  },
);

export const createImportTagHierarchy = (tags: TagToUpsert[]) => {
  const childrenByLabel = new Map<string, TagToUpsert[]>();
  const roots: TagToUpsert[] = [];

  for (const tag of sortTags(mergeTagDefinitions(tags))) {
    if (!tag.parentLabels?.length) roots.push(tag);

    for (const label of new Set(tag.parentLabels?.map((parent) => parent.toLowerCase()))) {
      if (!childrenByLabel.has(label)) childrenByLabel.set(label, []);

      childrenByLabel.get(label).push(tag);
    }
  }

  roots.sort(
    (a, b) =>
      Number(childrenByLabel.has(b.label.toLowerCase())) -
      Number(childrenByLabel.has(a.label.toLowerCase())),
  );

  return { childrenByLabel, roots };
};

export const getImportTagRows = (
  { childrenByLabel, roots }: ReturnType<typeof createImportTagHierarchy>,
  expanded: Set<string> | "all",
  collapsed?: Set<string>,
) => {
  const rows: { depth: number; hasChildren: boolean; key: string; tag: TagToUpsert }[] = [];
  const pending = roots
    .map((tag) => ({ ancestors: [] as string[], key: JSON.stringify(tag.label), tag }))
    .reverse();

  while (pending.length) {
    const { ancestors, key, tag } = pending.pop();
    const label = tag.label.toLowerCase();

    if (ancestors.includes(label)) continue;

    const children = childrenByLabel.get(label) ?? [];

    rows.push({ depth: ancestors.length, hasChildren: children.length > 0, key, tag });

    if (collapsed?.has(key) || (expanded !== "all" && !expanded.has(key))) continue;

    for (let idx = children.length - 1; idx >= 0; idx--) {
      const child = children[idx];

      pending.push({
        ancestors: [...ancestors, label],
        key: `${key}/${JSON.stringify(child.label)}`,
        tag: child,
      });
    }
  }

  return rows;
};
