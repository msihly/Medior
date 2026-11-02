import { useCallback, useState } from "react";
import { Grid, GridProps } from "react-window";
import { Comp } from "medior/components";
import { makeClasses } from "medior/utils/client";
import type { TagRowProps } from "./tag-row";
import { TAG_GAP } from "./tag-row-constants";
import { VirtualTagCell, VirtualTagData } from "./virtual-tag-cell";

export const VirtualTagRow = Comp(({ disabled, tags }: Pick<TagRowProps, "disabled" | "tags">) => {
  const { css } = useClasses(null);

  const [widths, setWidths] = useState(() => new Map<string, number>());

  const onWidth = useCallback(
    (index: number, width: number) => {
      if (width <= 0) return;

      const label = tags[index].label;

      setWidths((previous) =>
        previous.get(label) === width ? previous : new Map(previous).set(label, width),
      );
    },
    [tags],
  );

  const getColumnWidth = useCallback(
    (index: number) =>
      (widths.get(tags[index].label) ?? 160) + (index < tags.length - 1 ? TAG_GAP : 0),
    [tags, widths],
  );

  return (
    <Grid
      cellComponent={VirtualTagCell}
      cellProps={{ disabled, onWidth, tags }}
      columnCount={tags.length}
      columnKey={getColumnKey}
      columnWidth={getColumnWidth}
      rowCount={1}
      rowHeight="100%"
      style={{ overflowX: "auto", overflowY: "hidden" }}
      className={css.grid}
    />
  );
});

const getColumnKey: GridProps<VirtualTagData>["columnKey"] = ({ columnIndex, data }) =>
  data.tags[columnIndex].label;

const useClasses = makeClasses({
  grid: {
    height: "100%",
  },
});
