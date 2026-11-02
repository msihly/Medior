import { useLayoutEffect, useRef } from "react";
import { CellComponentProps } from "react-window";
import { TagChip, TagToUpsert, View } from "medior/components";

export interface VirtualTagData {
  disabled: boolean;
  onWidth: (index: number, width: number) => void;
  tags: TagToUpsert[];
}

export const VirtualTagCell = ({
  columnIndex,
  disabled,
  onWidth,
  style,
  tags,
}: CellComponentProps<VirtualTagData>) => {
  const rowRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const row = rowRef.current;

    if (!row) return;

    const measure = () => onWidth(columnIndex, parseFloat(getComputedStyle(row).width));

    const observer = new ResizeObserver(measure);

    observer.observe(row);
    measure();

    return () => observer.disconnect();
  }, [columnIndex, onWidth]);

  return (
    <View style={style}>
      <View ref={rowRef} row margins={{ top: 10 }} width="max-content">
        <TagChip tag={tags[columnIndex]} disabled={disabled} hasEditor width="fit-content" />
      </View>
    </View>
  );
};
