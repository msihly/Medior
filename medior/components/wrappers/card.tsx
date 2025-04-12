import { forwardRef, MutableRefObject, ReactNode } from "react";
import { HeaderWrapper, View, ViewProps } from "medior/components";
import { colors } from "medior/utils/client";
import { deepMerge } from "medior/utils/common";

export interface CardProps extends ViewProps {
  header?: ReactNode;
  headerProps?: Partial<ViewProps>;
}

export const Card = forwardRef(
  (
    {
      bgColor = colors.foreground,
      borderRadiuses = {},
      children,
      column = true,
      display = "flex",
      header,
      height,
      headerProps,
      overflow,
      padding = {},
      row = false,
      spacing,
      width,
      ...viewProps
    }: CardProps,
    ref: MutableRefObject<HTMLDivElement>,
  ) => {
    borderRadiuses = deepMerge({ bottom: "0.5rem", top: !!header ? 0 : "0.5rem" }, borderRadiuses);
    padding = deepMerge({ all: "0.5rem" }, padding);

    return (
      <HeaderWrapper
        {...viewProps}
        {...{ borderRadiuses, display, header, headerProps, height, overflow, width }}
      >
        <View
          position="relative"
          column={column && !row}
          flex={1}
          {...{ bgColor, borderRadiuses, height, overflow, padding, ref, row, spacing, width }}
          {...viewProps}
          aria-label="card"
        >
          {children}
        </View>
      </HeaderWrapper>
    );
  },
);
