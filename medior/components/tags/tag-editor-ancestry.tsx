import { useCallback, useEffect, useState } from "react";
import AutoSizer from "react-virtualized-auto-sizer";
import { FixedSizeList } from "react-window";
import type { SocketEvents, TagSchema } from "medior/_generated/server";
import { Comp, HeaderWrapper, TagToUpsert, View } from "medior/components";
import {
  createImportTagHierarchy,
  getImportTagRows,
  IMPORT_TAG_ROW_HEIGHT,
  TagHierarchy,
} from "medior/components/imports/editor/tag-hierarchy";
import { TagEditorStore } from "medior/store";
import { colors, toast } from "medior/utils/client";
import { socket, trpc } from "medior/utils/server";

type AncestryTag = Pick<TagSchema, "category" | "count" | "id" | "label" | "parentIds">;

export const makeEditorAncestry = (
  tags: AncestryTag[],
  current: AncestryTag,
  childIds: string[],
) => {
  const byId = new Map(tags.map((tag) => [tag.id, tag]));

  byId.set(current.id, current);

  for (const id of childIds) {
    const child = byId.get(id);

    if (child)
      byId.set(id, { ...child, parentIds: [...new Set([...child.parentIds, current.id])] });
  }

  const included = new Set<string>();
  const pending = [current.id, ...childIds];

  while (pending.length) {
    const id = pending.pop();

    if (included.has(id)) continue;

    included.add(id);
    pending.push(...(byId.get(id)?.parentIds ?? []));
  }

  return [...included].flatMap((id): TagToUpsert[] => {
    const tag = byId.get(id);

    return tag
      ? [
          {
            category: tag.category,
            count: tag.count,
            id: id === "draft" ? undefined : id,
            label: tag.label,
            parentLabels: tag.parentIds.map((id) => byId.get(id)?.label).filter(Boolean),
          },
        ]
      : [];
  });
};

export interface TagEditorAncestryProps {
  onTagClick?: (tag: TagToUpsert) => void;
  store: TagEditorStore;
}

export const TagEditorAncestry = Comp(({ onTagClick, store }: TagEditorAncestryProps) => {
  const [collapsed, setCollapsed] = useState(new Set<string>());
  const [isLoading, setIsLoading] = useState(false);
  const [rowWidth, setRowWidth] = useState(0);
  const [tags, setTags] = useState<AncestryTag[]>([]);

  const ids = [
    ...new Set(
      [
        store.tag?.id,
        ...store.parentTags.map((tag) => tag.id),
        ...store.childTags.map((tag) => tag.id),
      ].filter(Boolean),
    ),
  ];

  const hierarchy = createImportTagHierarchy(
    makeEditorAncestry(
      tags,
      {
        category: {
          color: store.categoryColor,
          icon: store.categoryIcon,
          inheritable: store.categoryInheritable,
          sortRank: store.categorySortRank,
        },
        count: store.tag?.count ?? 0,
        id: store.tag?.id ?? "draft",
        label: store.label.trim() || "New Tag",
        parentIds: store.parentTags.map((tag) => tag.id),
      },
      store.childTags.map((tag) => tag.id),
    ),
  );

  const rows = getImportTagRows(hierarchy, "all", collapsed);

  useEffect(() => {
    if (!store.isOpen || store.isLoading) return;

    let active = true;
    let inFlight = false;
    let revision = 0;
    let timer: ReturnType<typeof setTimeout>;
    const knownIds = new Set(ids);

    const load = async () => {
      if (inFlight) return;

      inFlight = true;

      const request = ++revision;

      setIsLoading(true);

      try {
        const res = await trpc.listTagAncestry.mutate({ ids });

        if (!active || request !== revision) return;

        if (!res.success) throw new Error(res.error);

        for (const tag of res.data) knownIds.add(tag.id);

        setTags(res.data);
      } catch (error) {
        if (active && request === revision) toast.error(error);
      } finally {
        inFlight = false;

        if (active) {
          if (request === revision) setIsLoading(false);
          else {
            clearTimeout(timer);
            load();
          }
        }
      }
    };

    const schedule = () => {
      revision++;
      clearTimeout(timer);
      timer = setTimeout(load, 50);
    };

    const onUpdated = ({ id, updates }: Parameters<SocketEvents["onTagUpdated"]>[0]) => {
      if (knownIds.has(id) && ["childIds", "label", "parentIds"].some((key) => key in updates))
        schedule();
    };

    const onUpdatedMany = ({ tags }: Parameters<SocketEvents["onTagsUpdated"]>[0]) => {
      if (
        tags.some(
          ({ tagId, updates }) =>
            knownIds.has(tagId) && ["childIds", "label", "parentIds"].some((key) => key in updates),
        )
      )
        schedule();
    };

    const onDeleted = ({ ids }: Parameters<SocketEvents["onTagDeleted"]>[0]) => {
      if (ids.some((id) => knownIds.has(id))) schedule();
    };

    load();
    socket.on("connected", schedule);
    socket.on("onReloadTags", schedule);
    socket.on("onTagUpdated", onUpdated);
    socket.on("onTagsUpdated", onUpdatedMany);
    socket.on("onTagDeleted", onDeleted);

    return () => {
      active = false;
      clearTimeout(timer);
      socket.off("connected", schedule);
      socket.off("onReloadTags", schedule);
      socket.off("onTagUpdated", onUpdated);
      socket.off("onTagsUpdated", onUpdatedMany);
      socket.off("onTagDeleted", onDeleted);
    };
  }, [ids.join("|"), store.isLoading, store.isOpen]);

  useEffect(() => {
    setCollapsed(new Set());
    setRowWidth(0);
  }, [store.tag?.id]);

  const measureRow = useCallback(
    (width: number) => setRowWidth((previous) => Math.max(previous, width)),
    [],
  );

  const toggle = (key: string) =>
    setCollapsed((previous) => {
      const next = new Set(previous);

      if (next.has(key)) next.delete(key);
      else next.add(key);

      return next;
    });

  return (
    <HeaderWrapper
      header={isLoading ? "Ancestry (loading...)" : "Ancestry"}
      headerProps={{ flex: "none" }}
      column
      minHeight={0}
      minWidth={0}
      overflow="hidden"
      width="100%"
      height="100%"
    >
      <View
        flex={1}
        minHeight={0}
        overflow="hidden"
        bgColor="rgb(0 0 0 / 0.2)"
        borderRadiuses={{ bottom: "0.3rem" }}
        borders={{ all: `1px dotted ${colors.custom.grey}` }}
      >
        <AutoSizer>
          {({ height, width }) => (
            <FixedSizeList
              height={height}
              width={width}
              itemCount={rows.length}
              itemSize={IMPORT_TAG_ROW_HEIGHT}
              itemKey={(index) => rows[index].key}
            >
              {({ index, style }) => {
                const row = rows[index];

                return (
                  <View style={{ ...style, minWidth: rowWidth }}>
                    <TagHierarchy
                      depth={row.depth}
                      expanded={!collapsed.has(row.key)}
                      hasChildren={row.hasChildren}
                      hasEditor={false}
                      onTagClick={onTagClick}
                      onToggle={() => toggle(row.key)}
                      onWidth={measureRow}
                      tag={row.tag}
                    />
                  </View>
                );
              }}
            </FixedSizeList>
          )}
        </AutoSizer>
      </View>
    </HeaderWrapper>
  );
});
