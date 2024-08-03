import { forwardRef, HTMLAttributes, MutableRefObject, ReactNode } from "react";
import { CSS, makeClasses, Margins, Padding } from "medior/utils";

export interface ViewProps extends HTMLAttributes<HTMLDivElement> {
  align?: CSS["alignItems"];
  children?: ReactNode | ReactNode[];
  className?: string;
  column?: boolean;
  flex?: CSS["flex"];
  height?: CSS["height"];
  justify?: CSS["justifyContent"];
  margins?: Margins;
  overflow?: CSS["overflow"];
  padding?: Padding;
  row?: boolean;
  spacing?: CSS["marginRight"];
  width?: CSS["width"];
}

export const View = forwardRef(
  (
    {
      align,
      children,
      className,
      column = false,
      flex,
      height,
      justify,
      margins,
      overflow,
      padding,
      row = false,
      spacing,
      width,
      ...props
    }: ViewProps,
    ref?: MutableRefObject<HTMLDivElement>
  ) => {
    const { css, cx } = useClasses({
      align,
      column,
      flex,
      height,
      justify,
      margins,
      overflow,
      padding,
      row,
      spacing,
      width,
    });

    return (
      <div {...props} ref={ref} className={cx(className, css.root)}>
        {children}
      </div>
    );
  }
);

interface ClassesProps {
  align: CSS["alignItems"];
  column: boolean;
  flex: CSS["flex"];
  height: CSS["height"];
  justify: CSS["justifyContent"];
  margins: Margins;
  overflow: CSS["overflow"];
  padding: Padding;
  row: boolean;
  spacing: CSS["marginRight"];
  width: CSS["width"];
}

const useClasses = makeClasses((_, props: ClassesProps) => ({
  root: {
    display: props?.column || props?.row ? "flex" : undefined,
    flexDirection: props?.column ? "column" : props?.row ? "row" : undefined,
    flex: props?.flex,
    alignItems: props?.align,
    justifyContent: props?.justify,
    margin: props?.margins?.all,
    marginTop: props?.margins?.top,
    marginBottom: props?.margins?.bottom,
    marginRight: props?.margins?.right,
    marginLeft: props?.margins?.left,
    padding: props?.padding?.all,
    paddingTop: props?.padding?.top,
    paddingBottom: props?.padding?.bottom,
    paddingRight: props?.padding?.right,
    paddingLeft: props?.padding?.left,
    overflow: props?.overflow,
    height: props?.height,
    width: props?.width,
    ...(props?.spacing
      ? {
          "& > *:not(:last-child)": {
            [props?.column ? "marginBottom" : "marginRight"]: props?.spacing,
          },
        }
      : {}),
  },
}));
