import { ReactNode } from "react";
import { HeaderWrapper, View, ViewProps } from "medior/components";
import { BorderRadiuses, colors, CSS, deepMerge, Padding } from "medior/utils";

const DEFAULT_BORDER_RADIUSES: BorderRadiuses = { all: "0.5rem" };

const DEFAULT_PADDING: Padding = { all: "0.5rem" };

export interface CardProps extends ViewProps {
  bgColor?: CSS["backgroundColor"];
  header?: ReactNode;
  headerProps?: Partial<ViewProps>;
}

export const Card = ({
  bgColor = colors.foreground,
  borderRadiuses = {},
  children,
  column = true,
  header,
  headerProps = {},
  padding = {},
  row = false,
  width,
  ...viewProps
}: CardProps) => {
  borderRadiuses = deepMerge(DEFAULT_BORDER_RADIUSES, borderRadiuses);
  padding = deepMerge(DEFAULT_PADDING, padding);

  return (
    <HeaderWrapper {...{ header, headerProps, width }} {...viewProps}>
      <View
        {...{ bgColor, padding, row, width }}
        column={column && !row}
        position="relative"
        borderRadiuses={{ ...borderRadiuses, ...(!!header ? { top: 0 } : {}) }}
        {...viewProps}
      >
        {children}
      </View>
    </HeaderWrapper>
  );
};
