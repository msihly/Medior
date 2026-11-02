import { useCallback, useLayoutEffect, useMemo, useState } from "react";
import { List, RowComponentProps, useListCallbackRef } from "react-window";
import { Comp, ImportEditor, TagToUpsert, View } from "medior/components";
import { Ingester, Reingester } from "medior/store";
import { colors, makeClasses } from "medior/utils/client";
import { createImportTagHierarchy, getImportTagRows, IMPORT_TAG_ROW_HEIGHT } from "./tag-hierarchy";

export interface TagHierarchyColumnData {
  expanded: Set<string>;
  hierarchy: ReturnType<typeof createImportTagHierarchy>;
  onToggle: (key: string) => void;
  onWidth: (label: string, width: number) => void;
  store: Ingester | Reingester;
}

export const TagHierarchyColumn = Comp(
  ({
    expanded,
    height,
    hierarchy,
    onToggle,
    onWidth,
    store,
    tag,
    width,
  }: TagHierarchyColumnData & {
    height: number;
    tag: TagToUpsert;
    width: number;
  }) => {
    const { css } = useClasses(null);

    const [list, setList] = useListCallbackRef(null);
    const [scrollbar, setScrollbar] = useState(0);

    const rows = useMemo(
      () => getImportTagRows({ ...hierarchy, roots: [tag] }, expanded),
      [hierarchy, tag, expanded],
    );

    const measuredWidth = useMemo(() => ({ value: 0 }), [rows]);

    const columnHeight = Math.floor(Math.min(height, rows.length * IMPORT_TAG_ROW_HEIGHT));
    const root = rows[0];

    const measureRow = useCallback(
      (rowWidth: number) => {
        measuredWidth.value = Math.max(measuredWidth.value, rowWidth);
        onWidth(tag.label, measuredWidth.value + 16 + scrollbar);
      },
      [measuredWidth, onWidth, scrollbar, tag.label],
    );

    useLayoutEffect(() => {
      const viewport = list?.element;
      if (!viewport) {
        setScrollbar(0);

        return;
      }

      const measure = () => setScrollbar(viewport.offsetWidth - viewport.clientWidth);

      const observer = new ResizeObserver(measure);

      observer.observe(viewport);
      measure();

      return () => observer.disconnect();
    }, [list]);

    return (
      <View
        column
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
          <List
            listRef={setList}
            rowComponent={TagHierarchyColumnRow}
            rowCount={rows.length - 1}
            rowHeight={IMPORT_TAG_ROW_HEIGHT}
            rowKey={getColumnRowKey}
            rowProps={{ expanded, onToggle, onWidth: measureRow, rows, store }}
            className={css.list}
          />
        )}
      </View>
    );
  },
);

interface TagHierarchyColumnRowProps {
  expanded: Set<string>;
  onToggle: (key: string) => void;
  onWidth: (width: number) => void;
  rows: ReturnType<typeof getImportTagRows>;
  store: Ingester | Reingester;
}

/** The root row sits above the list, so list rows start at the second row. */
const TagHierarchyColumnRow = ({
  expanded,
  index,
  onToggle,
  onWidth,
  rows,
  store,
  style,
}: RowComponentProps<TagHierarchyColumnRowProps>) => {
  const row = rows[index + 1];

  return (
    <View style={style}>
      <ImportEditor.TagHierarchy
        depth={row.depth}
        expanded={expanded.has(row.key)}
        hasChildren={row.hasChildren}
        onToggle={() => onToggle(row.key)}
        onWidth={onWidth}
        store={store}
        tag={row.tag}
      />
    </View>
  );
};

const getColumnRowKey = (index: number, { rows }: TagHierarchyColumnRowProps) =>
  rows[index + 1].key;

const useClasses = makeClasses({
  column: {
    boxSizing: "border-box",
  },
  list: {
    overflowX: "hidden",
  },
});
