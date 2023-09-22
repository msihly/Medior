import { forwardRef, HTMLAttributes, MutableRefObject, ReactNode } from "react";
import { CSSObject } from "tss-react";
import { makeClasses, Margins, Padding } from "utils";

export interface ViewProps extends HTMLAttributes<HTMLDivElement> {
  align?: CSSObject["alignItems"];
  children?: ReactNode | ReactNode[];
  className?: string;
  column?: boolean;
  flex?: CSSObject["flex"];
  justify?: CSSObject["justifyContent"];
  margins?: Margins;
  padding?: Padding;
  row?: boolean;
}

export const View = forwardRef(
  (
    {
      align,
      children,
      className,
      column = false,
      flex,
      justify,
      margins,
      padding,
      row = false,
      ...props
    }: ViewProps,
    ref?: MutableRefObject<HTMLDivElement>
  ) => {
    const { css, cx } = useClasses({ align, column, flex, justify, margins, padding, row });

    return (
      <div {...props} ref={ref} className={cx(css.root, className)}>
        {children}
      </div>
    );
  }
);

const useClasses = makeClasses((_, { align, column, flex, justify, margins, padding, row }) => ({
  root: {
    display: column || row ? "flex" : undefined,
    flexDirection: column ? "column" : row ? "row" : undefined,
    flex,
    alignItems: align,
    justifyContent: justify,
    margin: margins?.all,
    marginTop: margins?.top,
    marginBottom: margins?.bottom,
    marginRight: margins?.right,
    marginLeft: margins?.left,
    padding: padding?.all,
    paddingTop: padding?.top,
    paddingBottom: padding?.bottom,
    paddingRight: padding?.right,
    paddingLeft: padding?.left,
  },
}));
