import { ReactNode } from "react";
import { HeaderWrapper, View, ViewProps } from "medior/components";
import { colors } from "medior/utils";

export interface CardProps extends ViewProps {
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
  borderRadiuses = { all: "0.5rem", ...borderRadiuses };
  padding = { all: "0.5rem", ...padding };

  return (
    <HeaderWrapper {...{ header, headerProps, width }} {...viewProps}>
      <View
        {...{ bgColor, padding, row }}
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
