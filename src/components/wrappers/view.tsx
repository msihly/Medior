import { forwardRef, HTMLAttributes, MutableRefObject, ReactNode } from "react";
import { makeClasses, Margins, Padding } from "utils";

export interface ViewProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode | ReactNode[];
  className?: string;
  column?: boolean;
  margins?: Margins;
  padding?: Padding;
  row?: boolean;
}

export const View = forwardRef(
  (
    {
      children,
      className,
      column = false,
      margins = {},
      padding = {},
      row = false,
      ...props
    }: ViewProps,
    ref?: MutableRefObject<HTMLDivElement>
  ) => {
    const { css, cx } = useClasses({ column, margins, padding, row });

    return (
      <div {...props} ref={ref} className={cx(css.root, className)}>
        {children}
      </div>
    );
  }
);

const useClasses = makeClasses((_, { column, margins, padding, row }) => ({
  root: {
    display: column || row ? "flex" : undefined,
    flexDirection: column ? "column" : row ? "row" : undefined,
    margin: margins.all,
    marginTop: margins.top,
    marginBottom: margins.bottom,
    marginRight: margins.right,
    marginLeft: margins.left,
    padding: padding.all,
    paddingTop: padding.top,
    paddingBottom: padding.bottom,
    paddingRight: padding.right,
    paddingLeft: padding.left,
  },
}));
