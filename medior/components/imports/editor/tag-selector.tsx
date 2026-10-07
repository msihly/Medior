import path from "path";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import AutoSizer from "react-virtualized-auto-sizer";
import { VariableSizeList } from "react-window";
import { Card, Comp, ImportEditor, Text, View } from "medior/components";
import { ImportEditorOptions, Ingester, Reingester } from "medior/store";
import { createImportTagHierarchy, IMPORT_TAG_ROW_HEIGHT } from "./tag-hierarchy";
import { TagHierarchyCell } from "./tag-hierarchy-cell";

export interface TagSelectorProps {
  options: ImportEditorOptions;
  store: Ingester | Reingester;
}

export const TagSelector = Comp(({ options, store }: TagSelectorProps) => {
  const columnWidths = useRef(new Map<string, number>());
  const listRef = useRef<VariableSizeList>(null);

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [viewport, setViewport] = useState<HTMLDivElement>(null);
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
  }, [viewport]);

  useLayoutEffect(() => listRef.current?.resetAfterIndex(0), [hierarchy]);

  const setColumnWidth = useCallback((index: number, label: string, width: number) => {
    if (columnWidths.current.get(label) === width) return;

    columnWidths.current.set(label, width);
    listRef.current?.resetAfterIndex(index);
  }, []);

  const toggleExpanded = useCallback((key: string) => {
    setExpanded((previous) => {
      const next = new Set(previous);

      if (next.has(key)) next.delete(key);
      else next.add(key);

      return next;
    });
  }, []);

  const columnData = useMemo(
    () => ({
      expanded,
      height: viewportSize.height,
      hierarchy,
      onToggle: toggleExpanded,
      onWidth: setColumnWidth,
      store,
    }),
    [expanded, viewportSize.height, hierarchy, toggleExpanded, setColumnWidth, store],
  );

  return !shouldDisplay ? null : (
    <Card width="100%">
      <View row wrap="wrap" align="center" margins={{ bottom: "0.3rem" }}>
        <Text fontWeight={500} fontSize="0.9em" marginRight="0.5rem">
          {"Select Root Tag"}
        </Text>

        {[...store.rootFolderPath.split(path.sep).slice(0, -1), "**", "*"].map((p, i) => (
          <ImportEditor.RootFolderButton key={i} index={i} folderPart={p} store={store} />
        ))}
      </View>

      <View
        minWidth={0}
        overflow="hidden"
        height={
          hierarchy.roots.some((tag) => expanded.has(JSON.stringify(tag.label)))
            ? `calc(35vh + ${viewportSize.scrollbar}px)`
            : IMPORT_TAG_ROW_HEIGHT + viewportSize.scrollbar
        }
      >
        <AutoSizer>
          {({ height, width }) => (
            <VariableSizeList
              ref={listRef}
              outerRef={setViewport}
              height={height}
              width={width}
              layout="horizontal"
              itemCount={hierarchy.roots.length}
              itemData={columnData}
              itemSize={(index) => columnWidths.current.get(hierarchy.roots[index].label) ?? 280}
              itemKey={(index) => hierarchy.roots[index].label}
              style={{ overflowX: "auto", overflowY: "hidden" }}
            >
              {TagHierarchyCell}
            </VariableSizeList>
          )}
        </AutoSizer>
      </View>
    </Card>
  );
});
