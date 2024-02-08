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
  overflow?: CSSObject["overflow"];
  padding?: Padding;
  row?: boolean;
  spacing?: CSSObject["marginRight"];
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
      overflow,
      padding,
      row = false,
      spacing,
      ...props
    }: ViewProps,
    ref?: MutableRefObject<HTMLDivElement>
  ) => {
    const { css, cx } = useClasses({
      align,
      column,
      flex,
      justify,
      margins,
      padding,
      row,
      spacing,
      overflow,
    });

    return (
      <div {...props} ref={ref} className={cx(className, css.root)}>
        {children}
      </div>
    );
  }
);

interface ClassesProps {
  align: CSSObject["alignItems"];
  column: boolean;
  flex: CSSObject["flex"];
  justify: CSSObject["justifyContent"];
  margins: Margins;
  padding: Padding;
  row: boolean;
  spacing: CSSObject["marginRight"];
  overflow: CSSObject["overflow"];
}

const useClasses = makeClasses(
  (
    _,
    { align, column, flex, justify, margins, padding, row, spacing, overflow }: ClassesProps
  ) => ({
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
      overflow,
      ...(spacing ? { "& > *:not(:last-child)": { marginRight: spacing } } : {}),
    },
  })
);
