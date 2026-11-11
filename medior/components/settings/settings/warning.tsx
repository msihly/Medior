import { Comp, Icon, Text, View } from "medior/components";
import { colors } from "medior/utils/client";

export interface WarningProps {
  text: string;
}

/** A warning shown beside the settings it concerns, such as those that contact outside servers. */
export const Warning = Comp(({ text }: WarningProps) => (
  <View row align="center" spacing="0.5rem">
    <Icon name="Warning" color={colors.custom.orange} />

    <Text color={colors.custom.orange} whiteSpace="normal">
      {text}
    </Text>
  </View>
));
