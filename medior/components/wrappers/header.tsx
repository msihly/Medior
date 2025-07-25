import { ReactNode } from "react";
import { ConditionalWrap, Text, View, ViewProps } from "medior/components";
import { colors } from "medior/utils/client";
import { deepMerge } from "medior/utils/common";

const DEFAULT_HEADER_PROPS: HeaderWrapperProps["headerProps"] = {
  bgColor: colors.custom.black,
  borderRadiuses: { top: "0.5rem" },
  fontSize: "0.8em",
  justify: "center",
  padding: { all: "0.15rem 0.3rem" },
  row: true,
};

export interface HeaderWrapperProps extends ViewProps {
  header?: ReactNode;
  headerProps?: Partial<ViewProps> & { fontSize?: string };
}

export const HeaderWrapper = ({
  children,
  display,
  header,
  height = "auto",
  headerProps = {},
  position = "relative",
  row,
  spacing,
  ...viewProps
}: HeaderWrapperProps) => {
  headerProps = deepMerge(DEFAULT_HEADER_PROPS, headerProps);

  const wrap = (c: ReactNode) => (
    <View {...viewProps} column height={height} aria-label="header-wrapper">
      <View {...headerProps} aria-label="header">
        {typeof header === "string" ? (
          <Text flex={1} fontSize={headerProps.fontSize} textAlign="center">
            {header}
          </Text>
        ) : (
          header
        )}
      </View>

      {c}
    </View>
  );

  return (
    <ConditionalWrap condition={!!header} wrap={wrap}>
      <View
        overflow="auto"
        {...viewProps}
        {...{ display, height, position, row, spacing }}
        aria-label="header-wrapper-content"
      >
        {children}
      </View>
    </ConditionalWrap>
  );
};
