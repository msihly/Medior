import { Text, TextProps, View, ViewProps } from "components";
import { colors } from "utils";

export interface CenteredTextProps extends TextProps {
  color?: string;
  text: string;
  viewProps?: Partial<ViewProps>;
}

export const CenteredText = ({
  color = colors.grey["600"],
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
