import { ReactNode } from "react";
import { HeaderWrapper, View, ViewProps } from "medior/components";
import { colors, deepMerge } from "medior/utils";

export interface CardProps extends ViewProps {
  header?: ReactNode;
  headerProps?: Partial<ViewProps>;
}

export const Card = ({
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
}: CardProps) => {
  borderRadiuses = deepMerge({ bottom: "0.5rem", top: !!header ? 0 : "0.5rem" }, borderRadiuses);
  padding = deepMerge({ all: "0.5rem" }, padding);

  return (
    <HeaderWrapper
      {...viewProps}
      {...{ borderRadiuses, display, header, headerProps, height, width }}
    >
      <View
        position="relative"
        column={column && !row}
        flex={1}
        {...{ bgColor, borderRadiuses, height, overflow, padding, row, spacing, width }}
        {...viewProps}
        aria-label="card"
      >
        {children}
      </View>
    </HeaderWrapper>
  );
};
