import { ReactNode } from "react";
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { DialogContent } from "@mui/material";
import { Padding, makeClasses } from "medior/utils";

interface ContentProps {
  children: ReactNode | ReactNode[];
  className?: string;
  dividers?: boolean;
  padding?: Padding;
}

export const Content = ({ children, className, dividers = true, padding }: ContentProps) => {
  padding = { all: `${dividers ? "0.5rem" : "0.2rem"} 1rem`, ...padding };

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

const useClasses = makeClasses((props: ClassesProps) => ({
  content: {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    flex: 1,
    padding: props.padding?.all,
    paddingTop: props.padding?.top,
    paddingBottom: props.padding?.bottom,
    paddingRight: props.padding?.right,
    paddingLeft: props.padding?.left,
    overflow: "inherit",
  },
}));
