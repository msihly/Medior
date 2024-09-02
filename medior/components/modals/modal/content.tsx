import { ReactNode } from "react";
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { DialogContent } from "@mui/material";
import { Padding, makeClasses } from "medior/utils";

const DEFAULT_PADDING: Padding = { all: "0.5rem 1rem" };

interface ContentProps {
  children: ReactNode | ReactNode[];
  className?: string;
  dividers?: boolean;
  padding?: Padding;
}

export const Content = ({ children, className, dividers = true, padding }: ContentProps) => {
  padding = { ...DEFAULT_PADDING, ...padding };

  const { cx, css } = useClasses({ padding });

  return (
    <DialogContent {...{ dividers }} className={cx(css.content, className)}>
      {children}
    </DialogContent>
  );
};

interface ClassesProps {
  padding: Padding;
}

const useClasses = makeClasses(({ padding }: ClassesProps) => ({
  content: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    padding: padding?.all,
    paddingTop: padding?.top,
    paddingBottom: padding?.bottom,
    paddingRight: padding?.right,
    paddingLeft: padding?.left,
    overflow: "inherit",
  },
}));
