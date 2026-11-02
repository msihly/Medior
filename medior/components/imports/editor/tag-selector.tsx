import path from "path";
import { useCallback, useLayoutEffect, useMemo, useState } from "react";
import { Grid, GridProps, useGridCallbackRef } from "react-window";
import { Card, Comp, ImportEditor, Text, View } from "medior/components";
import { ImportEditorOptions, Ingester, Reingester } from "medior/store";
import { createImportTagHierarchy, IMPORT_TAG_ROW_HEIGHT } from "./tag-hierarchy";
import { TagHierarchyCell } from "./tag-hierarchy-cell";
import { TagHierarchyColumnData } from "./tag-hierarchy-column";

export interface TagSelectorProps {
  options: ImportEditorOptions;
  store: Ingester | Reingester;
}

export const TagSelector = Comp(({ options, store }: TagSelectorProps) => {
  const [columnWidths, setColumnWidths] = useState(() => new Map<string, number>());
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [grid, setGrid] = useGridCallbackRef(null);
  const [viewportSize, setViewportSize] = useState({ height: 0, scrollbar: 0 });

  const hierarchy = useMemo(
    () => createImportTagHierarchy(store.flatTagsToUpsert),
    [store.flatTagsToUpsert],
  );

  const shouldDisplay =
    store.flatTagsToUpsert.length > 0 ||
    options.folderToTagsMode !== "none" ||
    options.folderToCollectionMode === "withTag" ||
    (options.withDiffusionParams && options.withDiffusionTags);

  useLayoutEffect(() => {
    const viewport = grid?.element;
    if (!viewport) return;

    const measure = () => {
      const height = viewport.clientHeight;
      const scrollbar = viewport.offsetHeight - height;

      setViewportSize((previous) =>
        previous.height === height && previous.scrollbar === scrollbar
          ? previous
          : { height, scrollbar },
      );
    };

    const observer = new ResizeObserver(measure);

    observer.observe(viewport);
    measure();

    return () => observer.disconnect();
  }, [grid]);

  const getColumnWidth = useCallback(
    (index: number) => columnWidths.get(hierarchy.roots[index].label) ?? 280,
    [columnWidths, hierarchy],
  );

  const setColumnWidth = useCallback((label: string, width: number) => {
    setColumnWidths((previous) =>
      previous.get(label) === width ? previous : new Map(previous).set(label, width),
    );
  }, []);

  const toggleExpanded = useCallback((key: string) => {
    setExpanded((previous) => {
      const next = new Set(previous);

      if (next.has(key)) next.delete(key);
      else next.add(key);

      return next;
    });
  }, []);

  return !shouldDisplay ? null : (
    <Card width="100%">
      <View row wrap="wrap" align="center" margins={{ bottom: "0.3rem" }}>
        <Text fontWeight={500} fontSize="0.9em" margins={{ right: "0.5rem" }}>
          {"Select Root Tag"}
        </Text>

        {[...store.rootFolderPath.split(path.sep).slice(0, -1), "**", "*"].map((p, i) => (
          <ImportEditor.RootFolderButton key={i} index={i} folderPart={p} store={store} />
        ))}
      </View>

      <View
        column
        minWidth={0}
        overflow="hidden"
        height={
          hierarchy.roots.some((tag) => expanded.has(JSON.stringify(tag.label)))
            ? `calc(35vh + ${viewportSize.scrollbar}px)`
            : IMPORT_TAG_ROW_HEIGHT + viewportSize.scrollbar
        }
      >
        <Grid
          gridRef={setGrid}
          cellComponent={TagHierarchyCell}
          cellProps={{ expanded, hierarchy, onToggle: toggleExpanded, onWidth: setColumnWidth, store }}
          columnCount={hierarchy.roots.length}
          columnKey={getColumnKey}
          columnWidth={getColumnWidth}
          rowCount={1}
          rowHeight={viewportSize.height}
          style={{ overflowX: "auto", overflowY: "hidden" }}
        />
      </View>
    </Card>
  );
});

const getColumnKey: GridProps<TagHierarchyColumnData>["columnKey"] = ({ columnIndex, data }) =>
  data.hierarchy.roots[columnIndex].label;
