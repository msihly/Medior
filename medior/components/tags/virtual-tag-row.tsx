import { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import AutoSizer from "react-virtualized-auto-sizer";
import { VariableSizeList } from "react-window";
import { Comp } from "medior/components";
import type { TagRowProps } from "./tag-row";
import { TAG_GAP } from "./tag-row-constants";
import { VirtualTagCell } from "./virtual-tag-cell";

export const VirtualTagRow = Comp(({ disabled, tags }: Pick<TagRowProps, "disabled" | "tags">) => {
  const listRef = useRef<VariableSizeList | null>(null);
  const widths = useRef(new Map<string, number>());

  const setListRef = useCallback((list: VariableSizeList | null) => {
    listRef.current = list;

    // AutoSizer can mount the list after this component's layout effect has already run.
    // Its first cells measure before the list ref attaches, so replay those measurements now.
    list?.resetAfterIndex(0);
  }, []);

  const onWidth = useCallback(
    (index: number, width: number) => {
      if (width <= 0) return;

      const label = tags[index].label;

      if (widths.current.get(label) === width) return;

      widths.current.set(label, width);
      listRef.current?.resetAfterIndex(index);
    },
    [tags],
  );

  const data = useMemo(() => ({ disabled, onWidth, tags }), [disabled, onWidth, tags]);

  useLayoutEffect(() => listRef.current?.resetAfterIndex(0), [tags]);

  return (
    <AutoSizer>
      {({ height, width }) => (
        <VariableSizeList
          ref={setListRef}
          height={height}
          width={width}
          layout="horizontal"
          itemCount={tags.length}
          itemData={data}
          itemSize={(index) =>
            (widths.current.get(tags[index].label) ?? 160) + (index < tags.length - 1 ? TAG_GAP : 0)
          }
          itemKey={(index) => tags[index].label}
          style={{ overflowX: "auto", overflowY: "hidden" }}
        >
          {VirtualTagCell}
        </VariableSizeList>
      )}
    </AutoSizer>
  );
});
