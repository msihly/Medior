import { Text, TextProps, View, ViewProps } from "medior/components";
import { colors } from "medior/utils/client";

export interface CenteredTextProps extends TextProps {
  color?: string;
  text: string;
  viewProps?: Partial<ViewProps>;
}

export const CenteredText = ({
  color = colors.custom.lightGrey,
  text,
  viewProps = {},
  ...props
}: CenteredTextProps) => (
  <View row justify="center" align="center" flex={1} {...viewProps}>
    <Text {...props} {...{ color }}>
      {text}
    </Text>
  </View>
);
