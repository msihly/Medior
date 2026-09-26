import { useLayoutEffect, useRef } from "react";
import { ListChildComponentProps } from "react-window";
import { Comp, TagChip, TagToUpsert, View } from "medior/components";

export interface VirtualTagData {
  disabled: boolean;
  onWidth: (index: number, width: number) => void;
  tags: TagToUpsert[];
}

export const VirtualTagCell = Comp(
  ({ data, index, style }: ListChildComponentProps<VirtualTagData>) => {
    const rowRef = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
      const row = rowRef.current;
      if (!row) return;

      const measure = () => data.onWidth(index, parseFloat(getComputedStyle(row).width));
      const observer = new ResizeObserver(measure);
      observer.observe(row);
      measure();

      return () => observer.disconnect();
    }, [data.onWidth, index]);

    return (
      <View ref={rowRef} row style={{ ...style, height: "auto", top: 10, width: "max-content" }}>
        <TagChip tag={data.tags[index]} disabled={data.disabled} hasEditor width="fit-content" />
      </View>
    );
  },
);
