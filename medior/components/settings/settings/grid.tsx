import { ReactNode } from "react";
import { View } from "medior/components";
import { makeClasses } from "medior/utils/client";

export interface GridProps {
  children: ReactNode | ReactNode[];
  /** Label and control pairs per row. */
  pairs?: number;
}

export const Grid = ({ children, pairs = 2 }: GridProps) => {
  const { css } = useClasses({ pairs });

  return <View className={css.grid}>{children}</View>;
};

interface ClassesProps extends Pick<GridProps, "pairs"> {}

const useClasses = makeClasses((props: ClassesProps) => ({
  grid: {
    display: "grid",
    gridTemplateColumns: `repeat(${props.pairs}, 12rem minmax(min-content, 1fr))`,
    alignItems: "center",
    gap: "0.5rem 1rem",
  },
}));
