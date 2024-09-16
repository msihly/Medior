import { ReactNode } from "react";
import { ConditionalWrap, Text, View, ViewProps } from "medior/components";
import { colors, deepMerge } from "medior/utils";

const DEFAULT_HEADER_PROPS: HeaderWrapperProps["headerProps"] = {
  bgColor: colors.custom.black,
  borderRadiuses: { all: "0.5rem 0.5rem 0 0" },
  fontSize: "0.8em",
  justify: "center",
  padding: { all: "0.15rem 0.3rem" },
};

export interface HeaderWrapperProps extends ViewProps {
  header?: ReactNode;
  headerProps?: Partial<ViewProps> & { fontSize?: string };
}

export const HeaderWrapper = ({
  children,
  header,
  headerProps = {},
  position = "relative",
  ...viewProps
}: HeaderWrapperProps) => {
  headerProps = deepMerge(DEFAULT_HEADER_PROPS, headerProps);

  return (
    <ConditionalWrap
      condition={!!header}
      wrap={(c) => (
        <View column {...viewProps}>
          <View row {...headerProps}>
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
      )}
    >
      <View
        column={!viewProps?.row}
        flex={1}
        position={position}
        borderRadiuses={!!header ? { top: 0 } : undefined}
        {...viewProps}
      >
        {children}
      </View>
    </ConditionalWrap>
  );
};
