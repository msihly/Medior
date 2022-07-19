import { forwardRef, HTMLAttributes, ReactNode } from "react";
import { makeClasses } from "utils";

export interface ViewProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode | ReactNode[];
  className?: string;
  column?: boolean;
  row?: boolean;
}

const View = forwardRef(
  ({ children, className, column = false, row = false, ...props }: ViewProps, ref?: any) => {
    const { classes: css, cx } = useClasses({ column, row });

    return (
      <div {...props} ref={ref} className={cx(css.root, className)}>
        {children}
      </div>
    );
  }
);

export default View;

const useClasses = makeClasses((_, { column, row }) => ({
  root: {
    display: column || row ? "flex" : undefined,
    flexDirection: column ? "column" : row ? "row" : undefined,
  },
}));
