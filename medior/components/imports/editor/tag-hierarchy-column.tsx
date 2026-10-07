import { useCallback, useLayoutEffect, useMemo, useState } from "react";
import { FixedSizeList } from "react-window";
import { Comp, ImportEditor, TagToUpsert, View } from "medior/components";
import { Ingester, Reingester } from "medior/store";
import { colors, makeClasses } from "medior/utils/client";
import { createImportTagHierarchy, getImportTagRows, IMPORT_TAG_ROW_HEIGHT } from "./tag-hierarchy";

export interface TagHierarchyColumnData {
  expanded: Set<string>;
  height: number;
  hierarchy: ReturnType<typeof createImportTagHierarchy>;
  onToggle: (key: string) => void;
  onWidth: (index: number, label: string, width: number) => void;
  store: Ingester | Reingester;
}

export const TagHierarchyColumn = Comp(
  ({
    expanded,
    height,
    hierarchy,
    index,
    onToggle,
    onWidth,
    store,
    tag,
    width,
  }: TagHierarchyColumnData & {
    index: number;
    tag: TagToUpsert;
    width: number;
  }) => {
    const { css } = useClasses(null);

    const rows = useMemo(
      () => getImportTagRows({ ...hierarchy, roots: [tag] }, expanded),
      [hierarchy, tag, expanded],
    );

    const measuredWidth = useMemo(() => ({ value: 0 }), [rows]);

    const [scrollbar, setScrollbar] = useState(0);
    const [viewport, setViewport] = useState<HTMLDivElement>(null);

    const columnHeight = Math.floor(Math.min(height, rows.length * IMPORT_TAG_ROW_HEIGHT));
    const root = rows[0];

    const measureRow = useCallback(
      (rowWidth: number) => {
        measuredWidth.value = Math.max(measuredWidth.value, rowWidth);
        onWidth(index, tag.label, measuredWidth.value + 16 + scrollbar);
      },
      [index, measuredWidth, onWidth, scrollbar, tag.label],
    );

    useLayoutEffect(() => {
      if (!viewport) {
        setScrollbar(0);

        return;
      }

      const measure = () => setScrollbar(viewport.offsetWidth - viewport.clientWidth);

      const observer = new ResizeObserver(measure);

      observer.observe(viewport);
      measure();

      return () => observer.disconnect();
    }, [viewport]);

    return (
      <View
        height={columnHeight}
        width={width - 8}
        padding={{ left: 4, right: 4 }}
        className={css.column}
        bgColor={colors.background}
        borderRadiuses={{ all: "0.5rem" }}
      >
        <ImportEditor.TagHierarchy
          depth={root.depth}
          expanded={expanded.has(root.key)}
          hasChildren={root.hasChildren}
          onToggle={() => onToggle(root.key)}
          onWidth={measureRow}
          store={store}
          tag={root.tag}
        />

        {rows.length > 1 && (
          <FixedSizeList
            outerRef={setViewport}
            height={Math.max(0, columnHeight - IMPORT_TAG_ROW_HEIGHT)}
            width={Math.max(0, width - 16)}
            itemCount={rows.length - 1}
            itemSize={IMPORT_TAG_ROW_HEIGHT}
            itemKey={(index) => rows[index + 1].key}
            style={{ overflowX: "hidden", overflowY: "auto" }}
          >
            {({ index, style }) => {
              const row = rows[index + 1];

              return (
                <View style={style}>
                  <ImportEditor.TagHierarchy
                    depth={row.depth}
                    expanded={expanded.has(row.key)}
                    hasChildren={row.hasChildren}
                    onToggle={() => onToggle(row.key)}
                    onWidth={measureRow}
                    store={store}
                    tag={row.tag}
                  />
                </View>
              );
            }}
          </FixedSizeList>
        )}
      </View>
    );
  },
);

const useClasses = makeClasses({
  column: {
    boxSizing: "border-box",
  },
});
