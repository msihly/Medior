import { HTMLAttributes, ReactNode } from "react";
import { Comp } from "medior/components";
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
} from "medior/utils/client";

export interface ViewProps extends HTMLAttributes<HTMLDivElement> {
  align?: CSS["alignItems"];
  bgColor?: CSS["backgroundColor"];
  borders?: Borders;
  borderRadiuses?: BorderRadiuses;
  children?: ReactNode | ReactNode[];
  className?: string;
  column?: boolean;
  display?: CSS["display"];
  flex?: CSS["flex"];
  height?: CSS["height"];
  justify?: CSS["justifyContent"];
  margins?: Margins;
  opacity?: CSS["opacity"];
  overflow?: CSS["overflow"];
  padding?: Padding;
  position?: CSS["position"];
  row?: boolean;
  spacing?: CSS["marginRight"];
  width?: CSS["width"];
  wrap?: CSS["flexWrap"];
}

export const View = Comp(
  (
    {
      align,
      bgColor,
      borders,
      borderRadiuses,
      children,
      className,
      column,
      display,
      flex,
      height,
      justify,
      margins,
      opacity,
      overflow,
      padding,
      position,
      row,
      spacing,
      width,
      wrap,
      ...props
    }: ViewProps,
    ref,
  ) => {
    if (row) column = false;

    const { css, cx } = useClasses({
      align,
      bgColor,
      borders,
      borderRadiuses,
      column,
      display,
      flex,
      height,
      justify,
      margins,
      opacity,
      overflow,
      padding,
      position,
      row,
      spacing,
      width,
      wrap,
    });

    return (
      <div {...props} ref={ref} className={cx(className, css.view)}>
        {children}
      </div>
    );
  },
);

interface ClassesProps {
  align: CSS["alignItems"];
  bgColor: CSS["backgroundColor"];
  borders: Borders;
  borderRadiuses: BorderRadiuses;
  column: boolean;
  display: CSS["display"];
  flex: CSS["flex"];
  height: CSS["height"];
  justify: CSS["justifyContent"];
  margins: Margins;
  opacity: CSS["opacity"];
  overflow: CSS["overflow"];
  padding: Padding;
  position: CSS["position"];
  row: boolean;
  spacing: CSS["marginRight"];
  width: CSS["width"];
  wrap: CSS["flexWrap"];
}

const useClasses = makeClasses((props: ClassesProps) => ({
  view: {
    position: props.position,
    display: props.display ?? (props.column || props.row ? "flex" : undefined),
    flexDirection: props.column ? "column" : props.row ? "row" : undefined,
    flex: props.flex,
    flexWrap: props.wrap,
    alignItems: props.align,
    justifyContent: props.justify,
    ...makeBorders(props.borders),
    ...makeBorderRadiuses(props.borderRadiuses),
    ...makeMargins(props.margins),
    ...makePadding(props.padding),
    height: props.height,
    width: props.width,
    backgroundColor: props.bgColor,
    opacity: props.opacity,
    overflow: props.overflow,
    ...(props.spacing
      ? {
          "& > *:not(:last-child)": {
            [props.column ? "marginBottom" : "marginRight"]: props.spacing,
          },
        }
      : {}),
  },
}));
