import { Card, Comp, Text, View } from "medior/components";
import { colors } from "medior/utils/client";
import { ConfigKey } from "medior/utils/server";
import { ExtCheckbox } from "./ext-checkbox";

export interface ExtColumnProps {
  configKey: ConfigKey;
  label: string;
  options: string[];
}

export const ExtColumn = Comp(({ configKey, label, options }: ExtColumnProps) => {
  return (
    <View column height="100%" minWidth={0} spacing="0.3rem">
      <Text>{label}</Text>

      <Card bgColor={colors.foregroundCard} flex={1} minHeight={0} overflow="hidden auto">
        {options.map((ext) => (
          <ExtCheckbox key={ext} ext={ext} configKey={configKey} />
        ))}
      </Card>
    </View>
  );
});
