import { forwardRef, HTMLAttributes, MutableRefObject, ReactNode } from "react";
import {
  BorderRadiuses,
  Borders,
  CSS,
  makeBorderRadiuses,
  makeBorders,
  makeClasses,
  makeMargins,
  makePadding,
  Margins,
  Padding,
} from "medior/utils";

export interface ViewProps extends HTMLAttributes<HTMLDivElement> {
  align?: CSS["alignItems"];
  bgColor?: CSS["backgroundColor"];
  borders?: Borders;
  borderRadiuses?: BorderRadiuses;
  children?: ReactNode | ReactNode[];
  className?: string;
  column?: boolean;
  flex?: CSS["flex"];
  height?: CSS["height"];
  justify?: CSS["justifyContent"];
  margins?: Margins;
  overflow?: CSS["overflow"];
  padding?: Padding;
  position?: CSS["position"];
  row?: boolean;
  spacing?: CSS["marginRight"];
  width?: CSS["width"];
  wrap?: CSS["flexWrap"];
}

export const View = forwardRef(
  (
    {
      align,
      bgColor,
      borders,
      borderRadiuses,
      children,
      className,
      column = false,
      flex,
      height,
      justify,
      margins,
      overflow,
      padding,
      position,
      row = false,
      spacing,
      width,
      wrap,
      ...props
    }: ViewProps,
    ref?: MutableRefObject<HTMLDivElement>
  ) => {
    const { css, cx } = useClasses({
      align,
      bgColor,
      borders,
      borderRadiuses,
      column,
      flex,
      height,
      justify,
      margins,
      overflow,
      padding,
      position,
      row,
      spacing,
      width,
      wrap,
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
  bgColor: CSS["backgroundColor"];
  borders: Borders;
  borderRadiuses: BorderRadiuses;
  column: boolean;
  flex: CSS["flex"];
  height: CSS["height"];
  justify: CSS["justifyContent"];
  margins: Margins;
  overflow: CSS["overflow"];
  padding: Padding;
  position: CSS["position"];
  row: boolean;
  spacing: CSS["marginRight"];
  width: CSS["width"];
  wrap: CSS["flexWrap"];
}

const useClasses = makeClasses((props: ClassesProps) => ({
  root: {
    position: props?.position,
    display: props?.column || props?.row ? "flex" : undefined,
    flexDirection: props?.column ? "column" : props?.row ? "row" : undefined,
    flex: props?.flex,
    flexWrap: props?.wrap,
    alignItems: props?.align,
    justifyContent: props?.justify,
    ...makeBorders(props?.borders),
    ...makeBorderRadiuses(props),
    ...makeMargins(props?.margins),
    ...makePadding(props?.padding),
    height: props?.height,
    width: props?.width,
    backgroundColor: props?.bgColor,
    overflow: props?.overflow,
    ...(props?.spacing
      ? {
          "& > *:not(:last-child)": {
            [props?.column ? "marginBottom" : "marginRight"]: props?.spacing,
          },
        }
      : {}),
  },
}));
