import { ReactNode, useCallback, useState } from "react";
import { Card } from "medior/components";
import { LabelBox, LabelColumnsContext } from "./label-columns";

export interface SectionProps {
  children: ReactNode | ReactNode[];
}

/** The settings card, as tall as the section list beside it, which scrolls its own content. */
export const Section = ({ children }: SectionProps) => {
  const [labels, setLabels] = useState<Record<string, LabelBox>>({});

  const columnWidths: Record<number, number> = {};
  for (const { left, width } of Object.values(labels))
    columnWidths[left] = Math.max(columnWidths[left] ?? 0, width);

  const getWidth = (id: string) => columnWidths[labels[id]?.left];

  const removeLabel = useCallback(
    (id: string) =>
      setLabels((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      }),
    [],
  );

  const setLabel = useCallback(
    (id: string, label: LabelBox) =>
      setLabels((prev) =>
        prev[id]?.left === label.left && prev[id]?.width === label.width
          ? prev
          : { ...prev, [id]: label },
      ),
    [],
  );

  return (
    <LabelColumnsContext.Provider value={{ getWidth, removeLabel, setLabel }}>
      <Card flex={1} minWidth={0} maxWidth="60rem" spacing="0.5rem" overflow="hidden auto">
        {children}
      </Card>
    </LabelColumnsContext.Provider>
  );
};
